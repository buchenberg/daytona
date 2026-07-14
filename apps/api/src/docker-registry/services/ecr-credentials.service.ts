import { Injectable, Logger } from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr'
import {
  ECRPUBLICClient,
  GetAuthorizationTokenCommand as GetPublicAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr-public'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers'
import { TypedConfigService } from '../../config/typed-config.service'

interface EcrAuth {
  username: string
  password: string
}

const ECR_HOST_REGEX = /^\d+\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com$/
const PUBLIC_ECR_HOST = 'public.ecr.aws'
// ECR Public only issues authorization tokens from us-east-1, regardless of
// where the images themselves are served from.
const PUBLIC_ECR_REGION = 'us-east-1'
// Refresh ahead of AWS-side expiry (12h) to absorb clock skew.
const REFRESH_BUFFER_SEC = 30 * 60
// Short-lived negative cache so a misconfigured registry isn't re-resolved
// (incurring the full AWS SDK retry/timeout budget) on every build.
const NEGATIVE_CACHE_SEC = 60
// Sentinel marking a cached resolution failure.
const NEGATIVE_CACHE_MARKER = '__error'

interface NegativeCacheEntry {
  [NEGATIVE_CACHE_MARKER]: string
}

function isNegativeCacheEntry(value: unknown): value is NegativeCacheEntry {
  return typeof value === 'object' && value !== null && NEGATIVE_CACHE_MARKER in value
}

@Injectable()
export class EcrCredentialsService {
  private readonly logger = new Logger(EcrCredentialsService.name)
  private readonly brokerRoleArn: string
  private readonly publicDefaultAuthEnabled: boolean
  private apiArn = ''

  constructor(
    @InjectRedis() private readonly redis: Redis,
    configService: TypedConfigService,
  ) {
    this.brokerRoleArn = configService.get('ecr.brokerRoleArn')?.trim() ?? ''
    this.publicDefaultAuthEnabled = configService.get('ecr.publicDefaultAuthEnabled') ?? true
  }

  isEcrUrl(url: string): boolean {
    return ECR_HOST_REGEX.test(stripScheme(url))
  }

  isPublicEcrUrl(url: string): boolean {
    return stripScheme(url).split('/')[0] === PUBLIC_ECR_HOST
  }

  /**
   * Whether anonymous public.ecr.aws pulls should be authenticated with the
   * API's own AWS identity to lift ECR Public's low unauthenticated rate limit.
   * Org-configured public ECR registries (explicit role ARN) are unaffected.
   */
  get isPublicDefaultAuthEnabled(): boolean {
    return this.publicDefaultAuthEnabled
  }

  /**
   * Resolves a fresh `AWS:<token>` Docker auth pair for a private ECR registry
   * (`<account>.dkr.ecr.<region>.amazonaws.com`). AssumeRoles the supplied ARN,
   * unless it matches the API's own identity (auto-detected via STS) — then the
   * API's creds are used directly. Optionally hops through a broker role first
   * when set. Cached in Redis with TTL derived from AWS's `expiresAt`.
   */
  async resolveEcrCredentials(url: string, roleArn: string, externalId: string): Promise<EcrAuth> {
    const match = ECR_HOST_REGEX.exec(stripScheme(url))
    if (!match) {
      throw new Error(`Not an ECR URL: ${url}`)
    }
    const region = match[1]
    const normalizedArn = roleArn.trim()

    const apiArn = await this.getApiArn()
    const useApiIdentity = apiArn !== '' && apiArn === normalizedArn

    const cacheKey = useApiIdentity
      ? `ecr:token:default:${region}`
      : `ecr:token:${externalId}:${normalizedArn}:${region}`

    return this.resolveTokenWithCache({
      cacheKey,
      // Only negative-cache the per-role key, which is scoped to a single
      // (misconfigured) registry. The API-identity key is shared across all
      // tenants in the region, so caching a transient failure there would
      // wrongly fail-fast everyone for the TTL window.
      negativeCacheOnFailure: !useApiIdentity,
      fetch: async () => {
        const ecr = new ECRClient({
          region,
          credentials: this.buildSourceCredentials(useApiIdentity, normalizedArn, externalId),
        })
        const resp = await ecr.send(new GetAuthorizationTokenCommand({}))
        const data = resp.authorizationData?.[0]
        if (!data?.authorizationToken) {
          throw new Error('ECR returned no authorization data')
        }
        this.logger.log(
          `Resolved ECR credentials for region=${region} role=${useApiIdentity ? '(API identity)' : normalizedArn}${this.brokerRoleArn ? ' via broker' : ''}`,
        )
        return { token: data.authorizationToken, expiresAt: data.expiresAt }
      },
    })
  }

  /**
   * Resolves a fresh `AWS:<token>` Docker auth pair for ECR Public
   * (`public.ecr.aws`). Authenticated pulls lift ECR Public's low anonymous
   * rate limit.
   *
   * When `roleArn` is omitted (or matches the API's own identity), the API's
   * ambient AWS credentials are used directly — no per-org config needed. ECR
   * Public auth tokens are only issued from us-east-1. Cached in Redis with TTL
   * derived from AWS's `expiresAt`.
   */
  async resolvePublicEcrCredentials(roleArn?: string, externalId?: string): Promise<EcrAuth> {
    const normalizedArn = roleArn?.trim() ?? ''
    const apiArn = await this.getApiArn()
    const useApiIdentity = normalizedArn === '' || (apiArn !== '' && apiArn === normalizedArn)

    const cacheKey = useApiIdentity ? 'ecr:token:public:default' : `ecr:token:public:${externalId}:${normalizedArn}`

    return this.resolveTokenWithCache({
      cacheKey,
      // Public ECR always degrades gracefully to anonymous pulls, so briefly
      // negative-caching a failure (even on the shared default key) only avoids
      // hammering AWS — it never blocks a pull that would otherwise succeed.
      negativeCacheOnFailure: true,
      fetch: async () => {
        const ecrPublic = new ECRPUBLICClient({
          region: PUBLIC_ECR_REGION,
          credentials: this.buildSourceCredentials(useApiIdentity, normalizedArn, externalId),
        })
        const resp = await ecrPublic.send(new GetPublicAuthorizationTokenCommand({}))
        const data = resp.authorizationData
        if (!data?.authorizationToken) {
          throw new Error('ECR Public returned no authorization data')
        }
        this.logger.log(
          `Resolved public ECR credentials role=${useApiIdentity ? '(API identity)' : normalizedArn}${this.brokerRoleArn ? ' via broker' : ''}`,
        )
        return { token: data.authorizationToken, expiresAt: data.expiresAt }
      },
    })
  }

  // Builds the AWS credential provider for an ECR auth-token call. When a broker
  // role is set, the customer AssumeRole hops through it; otherwise the API's
  // ambient creds are the source. With useApiIdentity, no customer role is
  // assumed (the broker or ambient creds are used directly).
  private buildSourceCredentials(useApiIdentity: boolean, roleArn: string, externalId?: string) {
    const baseCredentials = this.brokerRoleArn
      ? fromTemporaryCredentials({
          params: { RoleArn: this.brokerRoleArn, RoleSessionName: `daytona-${externalId ?? 'default'}-broker` },
        })
      : undefined

    if (useApiIdentity) {
      return baseCredentials
    }

    return fromTemporaryCredentials({
      params: {
        RoleArn: roleArn,
        RoleSessionName: `daytona-${externalId}-pull`,
        ExternalId: externalId,
      },
      masterCredentials: baseCredentials,
    })
  }

  // Shared cache / decode / negative-cache wrapper around an ECR auth-token
  // fetch. The token is base64 `username:password`; both ECR and ECR Public
  // return it the same way.
  private async resolveTokenWithCache(opts: {
    cacheKey: string
    negativeCacheOnFailure: boolean
    fetch: () => Promise<{ token: string; expiresAt?: Date }>
  }): Promise<EcrAuth> {
    const { cacheKey, negativeCacheOnFailure, fetch } = opts

    const cached = await this.redis.get(cacheKey)
    if (cached) {
      try {
        const parsed: unknown = JSON.parse(cached)
        if (isNegativeCacheEntry(parsed)) {
          // Recent failure for this registry — fail fast instead of re-hitting AWS.
          throw new Error(`(cached) ${parsed[NEGATIVE_CACHE_MARKER]}`)
        }
        return parsed as EcrAuth
      } catch (err) {
        // Re-throw cached failures; only swallow JSON parse errors to refetch.
        if (err instanceof SyntaxError) {
          // corrupted cache entry — refetch
        } else {
          throw err
        }
      }
    }

    try {
      const { token, expiresAt } = await fetch()

      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      const sep = decoded.indexOf(':')
      if (sep < 0) {
        throw new Error('Unexpected ECR token format')
      }
      const auth: EcrAuth = {
        username: decoded.slice(0, sep),
        password: decoded.slice(sep + 1),
      }

      if (expiresAt) {
        const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000) - REFRESH_BUFFER_SEC
        if (ttl > 0) {
          await this.redis.setex(cacheKey, ttl, JSON.stringify(auth))
        }
      }

      return auth
    } catch (err) {
      if (negativeCacheOnFailure) {
        const message = err instanceof Error ? err.message : String(err)
        // Cache the failure briefly so subsequent pulls/builds don't each pay
        // the full AWS SDK retry/timeout budget for a misconfigured registry.
        const entry: NegativeCacheEntry = { [NEGATIVE_CACHE_MARKER]: message }
        await this.redis.setex(cacheKey, NEGATIVE_CACHE_SEC, JSON.stringify(entry)).catch(() => {
          // best-effort negative caching — ignore Redis write failures
        })
      }
      throw err
    }
  }

  // STS returns `arn:aws:sts::N:assumed-role/X/sess`; convert to the IAM role form `arn:aws:iam::N:role/X` so it can be compared against the user-supplied role ARN.
  private async getApiArn(): Promise<string> {
    if (this.apiArn) return this.apiArn
    try {
      const { Arn } = await new STSClient({}).send(new GetCallerIdentityCommand({}))
      this.apiArn = Arn?.replace(/^arn:aws:sts::(\d+):assumed-role\/([^/]+)\/.+$/, 'arn:aws:iam::$1:role/$2') ?? ''
      this.logger.log(`Resolved API identity: ${this.apiArn || `(empty STS response, raw=${Arn ?? 'undefined'})`}`)
    } catch (err) {
      this.logger.warn(`STS GetCallerIdentity failed: ${(err as Error).message}`)
    }
    return this.apiArn
  }
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as client from 'openid-client'

type OidcConfig = {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  readonly audience: string
  readonly callbackURL: string
  readonly allowedDomain: string
}

@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name)
  private config: client.Configuration | null = null
  private oidcConfig: OidcConfig | null = null

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const authProvider = this.configService.get<'auth0' | 'workos'>('authProvider')
    const skipConnections = this.configService.get('skipConnections')
    if (skipConnections) {
      this.logger.log('Skipping OIDC setup in test mode')
      return
    }

    const oidcConfig =
      authProvider === 'workos'
        ? this.configService.get<OidcConfig>('workosOidc')
        : this.configService.get<OidcConfig>('oidc')

    const issuerUrl = oidcConfig?.issuer
    const clientId = oidcConfig?.clientId
    const clientSecret = oidcConfig?.clientSecret
    const redirectUri = oidcConfig?.redirectUri

    if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
      this.logger.warn('OIDC configuration incomplete, skipping setup')
      return
    }

    try {
      // Auto-discover OIDC configuration (works with ANY provider!)
      this.config = await client.discovery(
        new URL(issuerUrl),
        clientId,
        undefined,
        client.ClientSecretPost(clientSecret),
      )
      this.oidcConfig = oidcConfig
      this.logger.log(`Discovered OIDC issuer: ${issuerUrl}`)
      this.logger.log('OIDC client initialized successfully')
    } catch (error) {
      this.logger.error(`Failed to initialize OIDC client: ${error.message}`)
      throw error
    }
  }

  getAuthorizationUrl(state: string): string {
    if (!this.config || !this.oidcConfig) {
      throw new Error('OIDC client not initialized')
    }

    const { redirectUri, audience } = this.oidcConfig

    const parameters: Record<string, string> = {
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
    }

    if (audience) {
      parameters.audience = audience
    }

    const authUrl = client.buildAuthorizationUrl(this.config, parameters)
    return authUrl.href
  }

  async handleCallback(code: string, redirectUri: string, expectedState: string): Promise<any> {
    if (!this.config) {
      throw new Error('OIDC client not initialized')
    }

    // Create a mock URL for the callback
    const callbackUrl = new URL(redirectUri)
    callbackUrl.searchParams.set('code', code)
    callbackUrl.searchParams.set('state', expectedState)
    callbackUrl.searchParams.set('iss', this.config.serverMetadata().issuer)

    // SECURITY FIX #1: Validate state parameter (no longer skipping!)
    const tokenSet = await client.authorizationCodeGrant(this.config, callbackUrl, {
      expectedState: expectedState,
    })

    return tokenSet
  }

  async getUserInfo(tokenSet: any): Promise<any> {
    if (!this.config || !this.oidcConfig) {
      throw new Error('OIDC client not initialized')
    }

    const accessToken = tokenSet.access_token
    if (!accessToken) {
      throw new Error('No access token available')
    }

    const claims = tokenSet.claims?.()
    if (!claims?.sub) {
      throw new Error('No ID token subject available')
    }

    const userInfo = await client.fetchUserInfo(this.config, accessToken, claims.sub)
    return userInfo
  }
}

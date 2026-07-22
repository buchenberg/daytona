import Redis from 'ioredis'
import { Controller, Get, Param, Query, Logger, NotFoundException, Req, UseGuards } from '@nestjs/common'
import { SandboxService } from '../services/sandbox.service'
import { Sandbox } from '../entities/sandbox.entity'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { ApiResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiOAuth2, ApiBearerAuth } from '@nestjs/swagger'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { OrganizationUserService } from '../../organization/services/organization-user.service'
import { AuthStrategyType } from '../../auth/enums/auth-strategy-type.enum'
import { AuthStrategy } from '../../auth/decorators/auth-strategy.decorator'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'
import { ProxyAuthContextGuard } from '../guards/proxy-auth-context.guard'
import { PreviewWarningDto } from '../dto/preview-warning.dto'
import { SandboxAccessGuard } from '../guards/sandbox-access.guard'

// Attached to a 404 only for org members whose sandbox was deleted, so the proxy
// can report "sandbox deleted" without leaking existence to other callers.
export const SANDBOX_DESTROYED_ERROR_CODE = 'SANDBOX_DESTROYED'

@Controller('preview')
@ApiTags('preview')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@UseGuards(AuthenticatedRateLimitGuard)
export class PreviewController {
  private readonly logger = new Logger(PreviewController.name)

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly sandboxService: SandboxService,
    private readonly organizationUserService: OrganizationUserService,
  ) {}

  @Get(':sandboxId/public')
  @ApiOperation({
    summary: 'Check if sandbox is public',
    operationId: 'isSandboxPublic',
  })
  @ApiParam({
    name: 'sandboxId',
    description: 'ID of the sandbox',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Public status of the sandbox',
    type: Boolean,
  })
  @AuthStrategy(AuthStrategyType.API_KEY)
  @UseGuards(ProxyAuthContextGuard)
  async isSandboxPublic(@Param('sandboxId') sandboxId: string): Promise<boolean> {
    const cached = await this.redis.get(`preview:public:${sandboxId}`)
    if (cached) {
      if (cached === '1') {
        return true
      }
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }

    try {
      const isPublic = await this.sandboxService.isSandboxPublic(sandboxId)
      //  for private sandboxes, throw 404 as well
      //  to prevent using the method to check if a sandbox exists
      if (!isPublic) {
        //  cache the result for 3 seconds to avoid unnecessary requests to the database
        await this.redis.setex(`preview:public:${sandboxId}`, 3, '0')

        throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
      }
      //  cache the result for 3 seconds to avoid unnecessary requests to the database
      await this.redis.setex(`preview:public:${sandboxId}`, 3, '1')
      return true
    } catch (ex) {
      if (ex instanceof NotFoundException) {
        //  cache the not found sandbox as well
        //  as it is the same case as for the private sandboxes
        await this.redis.setex(`preview:public:${sandboxId}`, 3, '0')
        throw ex
      }
      throw ex
    }
  }

  @Get(':sandboxId/preview-warning')
  @ApiOperation({
    summary: 'Check if the preview warning page is enabled for the sandbox',
    operationId: 'isPreviewWarningEnabled',
  })
  @ApiParam({
    name: 'sandboxId',
    description: 'ID of the sandbox, or a signed preview URL token (requires the port query param)',
    type: 'string',
  })
  @ApiQuery({
    name: 'port',
    description: 'Port the signed preview URL token was issued for. Required when sandboxId is a signed token.',
    type: 'number',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Whether the preview warning page is enabled for the sandbox',
    type: PreviewWarningDto,
  })
  @AuthStrategy(AuthStrategyType.API_KEY)
  @UseGuards(ProxyAuthContextGuard)
  async isPreviewWarningEnabled(
    @Param('sandboxId') sandboxId: string,
    @Query('port') port?: number,
  ): Promise<PreviewWarningDto> {
    const cacheKey = `preview:warning:${sandboxId}:${port ?? ''}`
    const cached = await this.redis.get(cacheKey)
    if (cached !== null) {
      return { enabled: cached === '1' }
    }

    const enabled = await this.sandboxService.isPreviewWarningEnabled(sandboxId, port)
    //  cache the result for 60 seconds to avoid unnecessary requests to the database
    await this.redis.setex(cacheKey, 60, enabled ? '1' : '0')
    return { enabled }
  }

  @Get(':sandboxId/validate/:authToken')
  @ApiOperation({
    summary: 'Check if sandbox auth token is valid',
    operationId: 'isValidAuthToken',
  })
  @ApiParam({
    name: 'sandboxId',
    description: 'ID of the sandbox',
    type: 'string',
  })
  @ApiParam({
    name: 'authToken',
    description: 'Auth token of the sandbox',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Sandbox auth token validation status',
    type: Boolean,
  })
  @AuthStrategy(AuthStrategyType.API_KEY)
  @UseGuards(ProxyAuthContextGuard)
  async isValidAuthToken(
    @Param('sandboxId') sandboxId: string,
    @Param('authToken') authToken: string,
  ): Promise<boolean> {
    const cached = await this.redis.get(`preview:token:${sandboxId}:${authToken}`)
    if (cached) {
      if (cached === '1') {
        return true
      }
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }
    const sandbox = await this.sandboxService.findOne(sandboxId)
    if (!sandbox) {
      await this.redis.setex(`preview:token:${sandboxId}:${authToken}`, 3, '0')
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }
    if (sandbox.authToken === authToken) {
      await this.redis.setex(`preview:token:${sandboxId}:${authToken}`, 3, '1')
      return true
    }
    await this.redis.setex(`preview:token:${sandboxId}:${authToken}`, 3, '0')
    throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
  }

  @Get(':sandboxId/signing-key')
  @ApiOperation({
    summary: 'Get the signing key for a sandbox',
    operationId: 'getSigningKey',
  })
  @ApiParam({
    name: 'sandboxId',
    description: 'ID of the sandbox',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Signing key of the sandbox',
    type: String,
  })
  @AuthStrategy(AuthStrategyType.API_KEY)
  @UseGuards(ProxyAuthContextGuard, SandboxAccessGuard)
  async getSigningKey(@Param('sandboxId') sandboxId: string): Promise<string> {
    return this.sandboxService.getSigningKey(sandboxId)
  }

  @Get(':sandboxId/access')
  @ApiOperation({
    summary: 'Check if user has access to the sandbox',
    operationId: 'hasSandboxAccess',
  })
  @ApiResponse({
    status: 200,
    description: 'User access status to the sandbox',
    type: Boolean,
  })
  @ApiResponse({
    status: 404,
    description:
      'Sandbox not found. For members of the owning organization whose sandbox was deleted, the body carries code "SANDBOX_DESTROYED".',
  })
  @AuthStrategy([AuthStrategyType.API_KEY, AuthStrategyType.JWT])
  async hasSandboxAccess(@Req() req: Request, @Param('sandboxId') sandboxId: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const userId = req.user?.userId

    const cacheKey = `preview:access:${sandboxId}:${userId}`
    const cached = await this.redis.get(cacheKey)
    if (cached) {
      if (cached === '1') {
        return true
      }
      if (cached === 'gone') {
        throw this.sandboxDeletedException(sandboxId)
      }
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }

    let sandbox: Sandbox
    try {
      sandbox = await this.sandboxService.findOne(sandboxId, true)
    } catch (ex) {
      if (!(ex instanceof NotFoundException)) {
        throw ex
      }
      await this.redis.setex(cacheKey, 3, '0')
      throw ex
    }

    const isOrgMember = await this.organizationUserService.exists(sandbox.organizationId, userId)

    // A destroyed sandbox (or one erroring on its way to destruction) is not
    // accessible, matching SandboxService.findOne's default not-found semantics.
    const isDestroyed = sandbox.state === SandboxState.DESTROYED
    const isErroredDestroying =
      [SandboxState.ERROR, SandboxState.BUILD_FAILED].includes(sandbox.state) &&
      sandbox.desiredState === SandboxDesiredState.DESTROYED

    if (isDestroyed || isErroredDestroying) {
      // Both states are treated as non-existent. Disclose deletion only to a
      // member of the owning org; everyone else gets a uniform 404 so existence
      // can't be probed.
      if (isOrgMember) {
        await this.redis.setex(cacheKey, 3, 'gone')
        throw this.sandboxDeletedException(sandboxId)
      }
      await this.redis.setex(cacheKey, 3, '0')
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }

    if (!isOrgMember) {
      await this.redis.setex(cacheKey, 3, '0')
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }
    //  if user has access, keep it in cache longer
    await this.redis.setex(cacheKey, 30, '1')
    return true
  }

  // A 404 tagged with a code so the proxy can distinguish a deleted sandbox from
  // a generic not-found without changing the status.
  private sandboxDeletedException(sandboxId: string): NotFoundException {
    return new NotFoundException({
      message: `Sandbox with ID ${sandboxId} has been deleted`,
      code: SANDBOX_DESTROYED_ERROR_CODE,
    })
  }

  @Get(':signedPreviewToken/:port/sandbox-id')
  @ApiOperation({
    summary: 'Get sandbox ID from signed preview URL token',
    operationId: 'getSandboxIdFromSignedPreviewUrlToken',
  })
  @ApiParam({
    name: 'signedPreviewToken',
    description: 'Signed preview URL token',
    type: 'string',
  })
  @ApiParam({
    name: 'port',
    description: 'Port number to get sandbox ID from signed preview URL token',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Sandbox ID from signed preview URL token',
    type: String,
  })
  @AuthStrategy(AuthStrategyType.API_KEY)
  @UseGuards(ProxyAuthContextGuard)
  async getSandboxIdFromSignedPreviewUrlToken(
    @Param('signedPreviewToken') signedPreviewToken: string,
    @Param('port') port: number,
  ): Promise<string> {
    return this.sandboxService.getSandboxIdFromSignedPreviewUrlToken(signedPreviewToken, port)
  }
}

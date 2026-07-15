import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common'
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { config } from '../../config/env'
import { InventorySyncService, verifyGithubSignature } from '../services'

/**
 * GitHub push webhook for the playbook repo — authenticated by HMAC signature
 * instead of a backoffice session, hence its own unguarded controller.
 */
@ApiTags('fleet')
@Controller('fleet/sync/webhook')
export class FleetSyncWebhookController {
  constructor(private readonly syncService: InventorySyncService) {}

  @Post()
  @HttpCode(202)
  @ApiExcludeEndpoint()
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: { ref?: string },
  ): { triggered: boolean } {
    const secret = config.fleet.inventory.webhookSecret
    if (!secret) throw new NotFoundException()
    if (!req.rawBody || !verifyGithubSignature(secret, req.rawBody, signature)) {
      throw new ForbiddenException('Invalid signature')
    }
    if (payload.ref !== `refs/heads/${config.fleet.inventory.branch}`) {
      return { triggered: false }
    }
    void this.syncService.sync().catch(() => undefined) // sync() already logs
    return { triggered: true }
  }
}

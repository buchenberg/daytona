/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as client from 'openid-client'

@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name)
  private config: client.Configuration | null = null

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const skipConnections = this.configService.get('skipConnections')
    if (skipConnections) {
      this.logger.log('Skipping OIDC setup in test mode')
      return
    }

    const issuerUrl = this.configService.get('oidc.issuer')
    const clientId = this.configService.get('oidc.clientId')
    const clientSecret = this.configService.get('oidc.clientSecret')
    const redirectUri = this.configService.get('oidc.redirectUri')

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
      this.logger.log(`Discovered OIDC issuer: ${issuerUrl}`)
      this.logger.log('OIDC client initialized successfully')
    } catch (error) {
      this.logger.error(`Failed to initialize OIDC client: ${error.message}`)
      throw error
    }
  }

  getAuthorizationUrl(state: string): string {
    if (!this.config) {
      throw new Error('OIDC client not initialized')
    }

    const redirectUri = this.configService.get('oidc.redirectUri')
    const audience = this.configService.get('oidc.audience')

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
    if (!this.config) {
      throw new Error('OIDC client not initialized')
    }

    const accessToken = tokenSet.access_token
    if (!accessToken) {
      throw new Error('No access token available')
    }

    const userInfo = await client.fetchUserInfo(this.config, accessToken, client.skipSubjectCheck)
    return userInfo
  }
}

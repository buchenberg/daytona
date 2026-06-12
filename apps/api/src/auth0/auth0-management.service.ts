/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
  UnauthorizedException,
} from '@nestjs/common'
import { TypedConfigService } from '../config/typed-config.service'
import axios, { AxiosError } from 'axios'
import * as crypto from 'crypto'

export interface Auth0CreateUserOptions {
  email: string
  name?: string
  emailVerified: boolean
  appMetadata?: Record<string, unknown>
}

export interface Auth0User {
  user_id: string
  email: string
  email_verified: boolean
  name?: string
  app_metadata?: Record<string, unknown>
}

@Injectable()
export class Auth0ManagementService {
  private readonly logger = new Logger(Auth0ManagementService.name)

  constructor(private readonly configService: TypedConfigService) {}

  isEnabled(): boolean {
    return !!this.configService.get('oidc.managementApi.enabled')
  }

  async findUserByEmail(email: string): Promise<Auth0User | null> {
    this.assertEnabled()
    const token = await this.getManagementApiToken()
    const issuer = this.configService.getOrThrow('oidc.issuer')

    try {
      const response = await axios.get<Auth0User[]>(`${issuer}/api/v2/users-by-email`, {
        params: { email: email.toLowerCase() },
        headers: { Authorization: `Bearer ${token}` },
      })

      const users = response.data || []
      if (users.length === 0) {
        return null
      }
      return users[0]
    } catch (error) {
      this.handleAxiosError(error, 'Failed to find Auth0 user by email')
    }
  }

  async createUser(options: Auth0CreateUserOptions): Promise<Auth0User> {
    this.assertEnabled()
    const token = await this.getManagementApiToken()
    const issuer = this.configService.getOrThrow('oidc.issuer')

    const payload: Record<string, unknown> = {
      connection: 'Username-Password-Authentication',
      email: options.email,
      email_verified: options.emailVerified,
      verify_email: !options.emailVerified,
      password: this.generateRandomPassword(),
    }

    if (options.name) {
      payload.name = options.name
    }
    if (options.appMetadata) {
      payload.app_metadata = options.appMetadata
    }

    try {
      const response = await axios.post<Auth0User>(`${issuer}/api/v2/users`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    } catch (error) {
      this.handleAxiosError(error, 'Failed to create Auth0 user')
    }
  }

  async findOrCreateUserByEmail(options: Auth0CreateUserOptions): Promise<Auth0User> {
    const existing = await this.findUserByEmail(options.email)
    if (existing) {
      return existing
    }
    return this.createUser(options)
  }

  async getManagementApiToken(): Promise<string> {
    try {
      const tokenResponse = await axios.post(`${this.configService.getOrThrow('oidc.issuer')}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: this.configService.getOrThrow('oidc.managementApi.clientId'),
        client_secret: this.configService.getOrThrow('oidc.managementApi.clientSecret'),
        audience: this.configService.getOrThrow('oidc.managementApi.audience'),
      })
      return tokenResponse.data.access_token
    } catch (error) {
      this.logger.error('Failed to get OIDC Management API token', error?.message || String(error))
      throw new UnauthorizedException()
    }
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Auth0 Management API is not enabled')
    }
  }

  private generateRandomPassword(): string {
    // Generates a 48-char base64url string that meets Auth0 default password policy
    // (length, mixed case, digit, symbol) when combined with a fixed marker char.
    const raw = crypto.randomBytes(32).toString('base64url')
    return `Dt!${raw}`
  }

  private handleAxiosError(error: unknown, message: string): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status
      const body = error.response?.data
      this.logger.error(`${message} (status=${status})`, body)
      throw new BadGatewayException({ message, status, body })
    }
    this.logger.error(message, this.errorDetails(error))
    throw new BadGatewayException(message)
  }

  private errorDetails(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }
}

/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { HttpModule, HttpService } from '@nestjs/axios'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { BackofficeUser } from '../backoffice-db/entities/backoffice-user.entity'
import { BackofficeUserService } from './services/backoffice-user.service'
import { AuditModule } from '../audit/audit.module'
import { OidcService } from './services/oidc.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { AuthController } from './auth.controller'
import { firstValueFrom } from 'rxjs'
import { catchError, map } from 'rxjs/operators'

interface OidcMetadata {
  issuer: string
  jwks_uri: string
  [key: string]: any
}

@Module({
  imports: [
    TypeOrmModule.forFeature([BackofficeUser], 'backoffice'),
    AuditModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
      property: 'user',
      session: false,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret') || 'default-secret-change-in-production',
        signOptions: {
          expiresIn: (configService.get('jwt.expiresIn') || '15m') as any,
        },
      }),
      inject: [ConfigService],
    }),
    HttpModule,
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    BackofficeUserService,
    OidcService,
    {
      provide: JwtStrategy,
      useFactory: async (
        userService: BackofficeUserService,
        httpService: HttpService,
        configService: ConfigService,
      ) => {
        // Skip OIDC setup in test mode
        const skipConnections = configService.get('skipConnections')
        if (skipConnections) {
          return null
        }

        // Discover OIDC configuration
        const issuerUrl = configService.get('oidc.issuer')
        if (!issuerUrl) {
          throw new Error('OIDC issuer not configured')
        }

        const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`

        const metadata = await firstValueFrom(
          httpService.get(discoveryUrl).pipe(
            map((response) => response.data as OidcMetadata),
            catchError((error) => {
              throw new Error(`Failed to fetch OIDC configuration: ${error.message}`)
            }),
          ),
        )

        let jwksUri = metadata.jwks_uri

        // Handle internal/public issuer URLs for Docker
        const internalIssuer = configService.get('oidc.issuer')
        const publicIssuer = configService.get('oidc.publicIssuer')
        if (publicIssuer) {
          jwksUri = metadata.jwks_uri.replace(publicIssuer, internalIssuer)
        }

        return new JwtStrategy(
          {
            audience: configService.get('oidc.audience') || configService.get('oidc.clientId'),
            issuer: metadata.issuer,
            jwksUri: jwksUri,
          },
          userService,
          configService,
        )
      },
      inject: [BackofficeUserService, HttpService, ConfigService],
    },
  ],
  exports: [BackofficeUserService, PassportModule, JwtStrategy, JwtModule, OidcService],
})
export class AuthModule {}

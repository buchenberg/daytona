import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './jwt.strategy'
import { ApiKeyStrategy } from './api-key.strategy'
import { UserModule } from '../user/user.module'
import { ApiKeyModule } from '../api-key/api-key.module'
import { SandboxModule } from '../sandbox/sandbox.module'
import { TypedConfigService } from '../config/typed-config.service'
import { HttpModule, HttpService } from '@nestjs/axios'
import { OidcMetadata } from 'oidc-client-ts'
import { firstValueFrom } from 'rxjs'
import { UserService } from '../user/user.service'
import { TypedConfigModule } from '../config/typed-config.module'
import { catchError, map } from 'rxjs/operators'
import { FailedAuthTrackerService } from './failed-auth-tracker.service'
import { RegionModule } from '../region/region.module'
import { AuthStrategyType } from './enums/auth-strategy-type.enum'

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: [AuthStrategyType.JWT, AuthStrategyType.API_KEY],
      property: 'user',
      session: false,
    }),
    TypedConfigModule,
    UserModule,
    ApiKeyModule,
    SandboxModule,
    RegionModule,
    HttpModule,
  ],
  providers: [
    ApiKeyStrategy,
    {
      provide: JwtStrategy,
      useFactory: async (userService: UserService, httpService: HttpService, configService: TypedConfigService) => {
        const authProvider = configService.get('authProvider')
        if (configService.get('skipConnections')) {
          return
        }

        const issuer =
          authProvider === 'workos' ? configService.getOrThrow('workosOidc.issuer') : configService.get('oidc.issuer')

        // Get the OpenID configuration from the issuer
        const discoveryUrl = `${issuer}/.well-known/openid-configuration`
        const metadata = await firstValueFrom(
          httpService.get(discoveryUrl).pipe(
            map((response) => response.data as OidcMetadata),
            catchError((error) => {
              throw new Error(`Failed to fetch OpenID configuration: ${error.message}`)
            }),
          ),
        )

        let jwksUri = metadata.jwks_uri

        if (authProvider !== 'workos') {
          const internalIssuer = configService.getOrThrow('oidc.issuer')
          const publicIssuer = configService.get('oidc.publicIssuer')
          if (publicIssuer) {
            // Replace localhost URLs with Docker network URLs for internal API use
            jwksUri = metadata.jwks_uri.replace(publicIssuer, internalIssuer)
          }
        }

        return new JwtStrategy(
          {
            audience:
              authProvider === 'workos'
                ? configService.getOrThrow('workosOidc.audience')
                : configService.get('oidc.audience'),
            issuer: authProvider === 'workos' ? issuer : metadata.issuer,
            jwksUri: jwksUri,
          },
          userService,
          configService,
        )
      },
      inject: [UserService, HttpService, TypedConfigService],
    },
    FailedAuthTrackerService,
  ],
  exports: [PassportModule, JwtStrategy, ApiKeyStrategy, FailedAuthTrackerService],
})
export class AuthModule {}

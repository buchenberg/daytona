import { ConfigService } from '@nestjs/config'
import { TypedConfigService } from '../typed-config.service'
import { ConfigurationDto } from './configuration.dto'

function createMockConfigService(authProvider: 'auth0' | 'workos'): TypedConfigService {
  const configService = new TypedConfigService(
    new ConfigService({
      version: '0.0.0-test',
      oidc: {
        issuer: 'https://auth.example.com',
        clientId: 'auth0-client',
        audience: 'daytona-api',
        managementApi: { enabled: false },
      },
      authProvider,
      workosOidc: {
        clientId: 'workos-client',
        issuer: 'https://workos.example.com',
        audience: 'workos-audience',
      },
      proxy: {
        templateUrl: 'https://proxy.example.com/{sandboxId}',
        toolboxUrl: 'https://proxy.example.com/toolbox',
      },
      defaultSnapshot: 'ubuntu:22.04',
      dashboardUrl: 'https://dashboard.example.com',
      maxAutoArchiveInterval: 43200,
      maintananceMode: false,
      environment: 'test',
    }),
  )

  jest.spyOn(configService, 'get')
  jest.spyOn(configService, 'getOrThrow')

  return configService
}

describe('ConfigurationDto authentication configuration', () => {
  it('omits WorkOS OIDC configuration for Auth0', () => {
    const configService = createMockConfigService('auth0')

    const configuration = new ConfigurationDto(configService)

    expect(configuration.authProvider).toBe('auth0')
    expect(configuration.workosOidc).toBeUndefined()
  })

  it('exposes WorkOS OIDC configuration when WorkOS is the auth provider', () => {
    const configService = createMockConfigService('workos')

    const configuration = new ConfigurationDto(configService)

    expect(configuration.authProvider).toBe('workos')
    expect(configuration.workosOidc?.issuer).toBe('https://workos.example.com')
  })
})

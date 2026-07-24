import 'reflect-metadata'

import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { MODULE_METADATA } from '@nestjs/common/constants'
import type { FactoryProvider, Provider } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { of } from 'rxjs'
import { AuthModule } from './auth.module'
import { JwtStrategy } from './jwt.strategy'
import { TypedConfigService } from '../config/typed-config.service'
import { UserService } from '../user/user.service'

const jwtStrategyProvider = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as readonly Provider[]).find(
  (provider): provider is FactoryProvider<JwtStrategy> =>
    typeof provider === 'object' &&
    provider !== null &&
    'provide' in provider &&
    provider.provide === JwtStrategy &&
    'useFactory' in provider &&
    typeof provider.useFactory === 'function',
)

if (!jwtStrategyProvider) {
  throw new Error('AuthModule must expose a JwtStrategy factory provider')
}

describe('AuthModule JwtStrategy factory', () => {
  const userServiceMock = {}
  const httpServiceMock = { get: jest.fn() }
  const configServiceMock = { get: jest.fn() }
  let testingModule: TestingModule | undefined

  const compileJwtStrategy = async (): Promise<JwtStrategy> => {
    testingModule = await Test.createTestingModule({
      providers: [
        jwtStrategyProvider,
        { provide: UserService, useValue: userServiceMock },
        { provide: HttpService, useValue: httpServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        TypedConfigService,
      ],
    }).compile()

    return testingModule.get(JwtStrategy)
  }

  afterEach(async () => {
    await testingModule?.close()
    testingModule = undefined
    httpServiceMock.get.mockReset()
    configServiceMock.get.mockReset()
  })

  it('uses WorkOS OIDC settings when authProvider is workos', async () => {
    const workosOidc = {
      issuer: 'https://auth.localtest.me',
      clientId: 'client_test',
      audience: 'client_test',
    }
    const auth0Oidc = {
      issuer: 'https://auth0-issuer.example.com',
      clientId: 'auth0_client',
      audience: 'auth0_aud',
    }

    configServiceMock.get.mockImplementation((key: string) => {
      switch (key) {
        case 'authProvider':
          return 'workos'
        case 'workosOidc':
          return workosOidc
        case 'workosOidc.issuer':
          return workosOidc.issuer
        case 'workosOidc.audience':
          return workosOidc.audience
        case 'oidc':
          return auth0Oidc
        case 'oidc.issuer':
          return auth0Oidc.issuer
        case 'oidc.audience':
          return auth0Oidc.audience
        case 'skipConnections':
          return false
        default:
          return undefined
      }
    })
    httpServiceMock.get.mockReturnValue(
      of({
        data: {
          issuer: workosOidc.issuer,
          jwks_uri: 'https://auth.localtest.me/oauth2/jwks',
        },
      }),
    )

    const strategy = await compileJwtStrategy()

    expect(httpServiceMock.get).toHaveBeenCalledWith(
      expect.stringContaining('auth.localtest.me/.well-known/openid-configuration'),
    )
    expect(httpServiceMock.get).not.toHaveBeenCalledWith(expect.stringContaining('auth0-issuer.example.com'))
    expect(strategy).toHaveProperty('options.audience', 'client_test')
    expect(strategy).toHaveProperty('options.issuer', 'https://auth.localtest.me')
  })

  it('uses Auth0 OIDC settings when authProvider is auth0', async () => {
    const workosOidc = {
      issuer: 'https://auth.localtest.me',
      clientId: 'client_test',
      audience: 'client_test',
    }
    const auth0Oidc = {
      issuer: 'https://auth0-issuer.example.com',
      clientId: 'auth0_client',
      audience: 'auth0_aud',
    }

    configServiceMock.get.mockImplementation((key: string) => {
      switch (key) {
        case 'authProvider':
          return 'auth0'
        case 'workosOidc':
          return workosOidc
        case 'workosOidc.issuer':
          return workosOidc.issuer
        case 'workosOidc.audience':
          return workosOidc.audience
        case 'oidc':
          return auth0Oidc
        case 'oidc.issuer':
          return auth0Oidc.issuer
        case 'oidc.audience':
          return auth0Oidc.audience
        case 'skipConnections':
          return false
        default:
          return undefined
      }
    })
    httpServiceMock.get.mockReturnValue(
      of({
        data: {
          issuer: auth0Oidc.issuer,
          jwks_uri: 'https://auth0-issuer.example.com/.well-known/jwks.json',
        },
      }),
    )

    const strategy = await compileJwtStrategy()

    expect(configServiceMock.get).toHaveBeenCalledWith('authProvider')
    expect(httpServiceMock.get).toHaveBeenCalledWith(
      expect.stringContaining('auth0-issuer.example.com/.well-known/openid-configuration'),
    )
    expect(httpServiceMock.get).not.toHaveBeenCalledWith(expect.stringContaining('auth.localtest.me'))
    expect(strategy).toHaveProperty('options.audience', 'auth0_aud')
    expect(strategy).toHaveProperty('options.issuer', 'https://auth0-issuer.example.com')
  })
})

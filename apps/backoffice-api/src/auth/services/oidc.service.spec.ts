import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import * as client from 'openid-client'

import { OidcService } from './oidc.service'

jest.mock('openid-client', () => ({
  discovery: jest.fn(),
  fetchUserInfo: jest.fn(),
  ClientSecretPost: jest.fn(() => () => undefined),
}))

type OidcConfig = {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly audience: string
  readonly redirectUri: string
  readonly callbackURL: string
  readonly allowedDomain: string
}

describe('OidcService AUTH_PROVIDER branching', () => {
  const configServiceMock = {
    get: jest.fn<unknown, [key: string]>(),
  }
  const discoveryMock = jest.mocked(client.discovery)
  const fetchUserInfoMock = jest.mocked(client.fetchUserInfo)

  const auth0Oidc = {
    issuer: 'https://auth0.localtest.me',
    clientId: 'auth0_client',
    clientSecret: 'auth0_secret',
    audience: 'auth0_audience',
    redirectUri: 'http://localhost:8080/api/v1/auth/callback',
    callbackURL: 'http://localhost:8080/api/v1/auth/callback',
    allowedDomain: 'auth0.example.com',
  } satisfies OidcConfig

  const workosOidc = {
    issuer: 'https://auth.localtest.me',
    clientId: 'client_test',
    clientSecret: 'secret_test',
    audience: 'client_test',
    redirectUri: 'http://localhost:8080/api/v1/auth/callback',
    callbackURL: 'http://localhost:8080/api/v1/auth/callback',
    allowedDomain: 'daytona.io',
  } satisfies OidcConfig

  beforeEach(() => {
    configServiceMock.get.mockReset()
    discoveryMock.mockReset()
    fetchUserInfoMock.mockReset()
  })

  it('uses workosOidc when AUTH_PROVIDER is workos', async () => {
    const configValues = new Map<string, unknown>([
      ['skipConnections', false],
      ['authProvider', 'workos'],
      ['workosOidc', workosOidc],
      ['oidc', auth0Oidc],
      ['oidc.issuer', auth0Oidc.issuer],
      ['oidc.clientId', auth0Oidc.clientId],
      ['oidc.clientSecret', auth0Oidc.clientSecret],
      ['oidc.redirectUri', auth0Oidc.redirectUri],
    ])
    configServiceMock.get.mockImplementation((key) => configValues.get(key))

    const testingModule = await Test.createTestingModule({
      providers: [OidcService, { provide: ConfigService, useValue: configServiceMock }],
    }).compile()
    const service = testingModule.get(OidcService)

    await service.onModuleInit()

    expect(discoveryMock).toHaveBeenCalledTimes(1)
    expect(discoveryMock).toHaveBeenCalledWith(expect.any(URL), workosOidc.clientId, undefined, expect.any(Function))
    expect(discoveryMock.mock.calls.map(([issuer]) => issuer.toString())).toContain(
      new URL(workosOidc.issuer).toString(),
    )
    expect(
      discoveryMock.mock.calls.some(
        ([issuer, clientId]) =>
          issuer.toString() === new URL(auth0Oidc.issuer).toString() && clientId === auth0Oidc.clientId,
      ),
    ).toBe(false)
    expect(configServiceMock.get).toHaveBeenCalledWith('authProvider')
    expect(configServiceMock.get).toHaveBeenCalledWith('workosOidc')
  })

  it('uses oidc when AUTH_PROVIDER is auth0', async () => {
    const configValues = new Map<string, unknown>([
      ['skipConnections', false],
      ['authProvider', 'auth0'],
      ['workosOidc', workosOidc],
      ['oidc', auth0Oidc],
      ['oidc.issuer', auth0Oidc.issuer],
      ['oidc.clientId', auth0Oidc.clientId],
      ['oidc.clientSecret', auth0Oidc.clientSecret],
      ['oidc.redirectUri', auth0Oidc.redirectUri],
    ])
    configServiceMock.get.mockImplementation((key) => configValues.get(key))

    const testingModule = await Test.createTestingModule({
      providers: [OidcService, { provide: ConfigService, useValue: configServiceMock }],
    }).compile()
    const service = testingModule.get(OidcService)

    await service.onModuleInit()

    expect(discoveryMock).toHaveBeenCalledTimes(1)
    expect(discoveryMock).toHaveBeenCalledWith(expect.any(URL), auth0Oidc.clientId, undefined, expect.any(Function))
    expect(discoveryMock.mock.calls.map(([issuer]) => issuer.toString())).toContain(
      new URL(auth0Oidc.issuer).toString(),
    )
    expect(
      discoveryMock.mock.calls.some(
        ([issuer, clientId]) =>
          issuer.toString() === new URL(workosOidc.issuer).toString() && clientId === workosOidc.clientId,
      ),
    ).toBe(false)
    expect(configServiceMock.get).toHaveBeenCalledWith('authProvider')
    expect(configServiceMock.get).toHaveBeenCalledWith('oidc')
  })

  it('uses the id token subject when fetching user info', async () => {
    const configValues = new Map<string, unknown>([
      ['skipConnections', false],
      ['authProvider', 'workos'],
      ['workosOidc', workosOidc],
    ])
    configServiceMock.get.mockImplementation((key) => configValues.get(key))
    fetchUserInfoMock.mockResolvedValue({ sub: 'user_123' })

    const testingModule = await Test.createTestingModule({
      providers: [OidcService, { provide: ConfigService, useValue: configServiceMock }],
    }).compile()
    const service = testingModule.get(OidcService)

    await service.onModuleInit()
    await service.getUserInfo({
      access_token: 'access-token',
      claims: () => ({ sub: 'subject-123' }),
    })

    expect(fetchUserInfoMock).toHaveBeenCalledWith(expect.any(Object), 'access-token', 'subject-123')
  })
})

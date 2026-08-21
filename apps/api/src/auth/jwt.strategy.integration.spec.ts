import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose'
import { Test, type TestingModule } from '@nestjs/testing'
import { JwtStrategy } from './jwt.strategy'
import { AuthStrategyType } from './enums/auth-strategy-type.enum'
import type { RequestWithAuthMetadata } from './interfaces/request-with-auth-metadata.interface'
import { CustomHeaders } from '../common/constants/header.constants'
import { TypedConfigService } from '../config/typed-config.service'
import { UserService } from '../user/user.service'

/**
 * Integration test that boots a local HTTP server serving a JWKS document
 * backed by an RSA keypair generated in-process. This exercises the full
 * JWKS-fetch + RS256-signature-verification path (via `jose.jwtVerify`
 * over `createRemoteJWKSet`) that the unit spec cannot reach because it
 * feeds `validate()` synthetic payloads.
 *
 * Together with jwt.strategy.spec.ts, this locks in:
 *   S1 — WorkOS access tokens carrying `daytona_user_id` resolve to the
 *        pre-existing Daytona user id (identity preservation across the
 *        Auth0 → WorkOS swap).
 *   S3 — Tokens WITHOUT `daytona_user_id` fall back to `sub` and create a
 *        brand-new user record.
 *   Signature gate — Tokens signed by a foreign RSA key are rejected by
 *        `verifyToken`, proving the JWKS gate is not merely decorative.
 */
describe('JwtStrategy integration — signed JWT + JWKS end-to-end', () => {
  const KID = 'test-workos-key'
  const ISSUER = 'https://auth.localtest.me'
  const AUDIENCE = 'client_test_stub'

  let privateKey: KeyLike
  let foreignPrivateKey: KeyLike
  let jwksServer: http.Server
  let jwksUri: string

  const userServiceMock = {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  }
  const configServiceMock = {
    getOrThrow: jest.fn(),
  }

  let testingModule: TestingModule
  let strategy: JwtStrategy

  beforeAll(async () => {
    // Trusted keypair — its public JWK is served by the mock JWKS endpoint.
    const trusted = await generateKeyPair('RS256', { extractable: true })
    privateKey = trusted.privateKey
    const publicJwk = {
      ...(await exportJWK(trusted.publicKey)),
      kid: KID,
      alg: 'RS256',
      use: 'sig',
    }

    // Foreign keypair — NEVER exposed via JWKS. Used by Test C to prove
    // the JWKS gate rejects signatures from unknown keys.
    const foreign = await generateKeyPair('RS256', { extractable: true })
    foreignPrivateKey = foreign.privateKey

    jwksServer = http.createServer((req, res) => {
      if (req.url === '/oauth2/jwks') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ keys: [publicJwk] }))
        return
      }
      res.writeHead(404)
      res.end()
    })

    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', () => resolve()))
    const port = (jwksServer.address() as AddressInfo).port
    jwksUri = `http://127.0.0.1:${port}/oauth2/jwks`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => jwksServer.close((err) => (err ? reject(err) : resolve())))
  })

  beforeEach(async () => {
    userServiceMock.findOne.mockReset()
    userServiceMock.create.mockReset()
    userServiceMock.update.mockReset()
    configServiceMock.getOrThrow.mockReset().mockReturnValue(42)

    testingModule = await Test.createTestingModule({
      providers: [
        { provide: UserService, useValue: userServiceMock },
        { provide: TypedConfigService, useValue: configServiceMock },
      ],
    }).compile()

    strategy = new JwtStrategy(
      {
        jwksUri,
        audience: AUDIENCE,
        issuer: ISSUER,
      },
      testingModule.get(UserService),
      testingModule.get(TypedConfigService),
    )
  })

  const makeRequest = (): RequestWithAuthMetadata => {
    const request = Object.create(null) as RequestWithAuthMetadata
    request.authMetadata = {
      isStrategyAllowed: (type: AuthStrategyType) => type === AuthStrategyType.JWT,
    }
    request.get = jest.fn().mockReturnValue('test-org-id')
    return request
  }

  const nowSec = () => Math.floor(Date.now() / 1000)

  it('S1 — verifyToken accepts a signed JWT and validate honors daytona_user_id (identity preservation)', async () => {
    const iat = nowSec()
    const exp = iat + 60

    const signedJwt = await new SignJWT({
      daytona_user_id: 'auth0|test-poc-user',
      email: 'test-poc-user@example.com',
      email_verified: true,
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user_01H_workos_generated')
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(privateKey)

    // Proves the JWKS fetch + RS256 signature verification path.
    const verifiedPayload = await strategy.verifyToken(signedJwt)

    expect(verifiedPayload).toEqual(
      expect.objectContaining({
        iss: ISSUER,
        aud: AUDIENCE,
        sub: 'user_01H_workos_generated',
        daytona_user_id: 'auth0|test-poc-user',
        email: 'test-poc-user@example.com',
        email_verified: true,
      }),
    )

    userServiceMock.findOne.mockResolvedValue({
      id: 'auth0|test-poc-user',
      name: 'PoC User',
      email: 'test-poc-user@example.com',
      emailVerified: true,
      role: 'user',
    })

    const request = makeRequest()
    const result = await strategy.validate(request, verifiedPayload)

    expect(request.get).toHaveBeenCalledWith(CustomHeaders.ORGANIZATION_ID.name)
    // Canonical id resolves to the daytona_user_id claim, NOT the WorkOS sub.
    expect(userServiceMock.findOne).toHaveBeenCalledWith('auth0|test-poc-user')
    expect(userServiceMock.findOne).not.toHaveBeenCalledWith('user_01H_workos_generated')
    // Pre-existing user found — no user creation.
    expect(userServiceMock.create).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'auth0|test-poc-user',
        email: 'test-poc-user@example.com',
        organizationId: 'test-org-id',
      }),
    )
  })

  it('S3 — verifyToken accepts a signed JWT without daytona_user_id and validate falls back to sub', async () => {
    const iat = nowSec()
    const exp = iat + 60

    const signedJwt = await new SignJWT({
      email: 'fallback@example.com',
      email_verified: true,
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user_01H_workos_generated')
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(privateKey)

    const verifiedPayload = await strategy.verifyToken(signedJwt)

    expect(verifiedPayload.daytona_user_id).toBeUndefined()
    expect(verifiedPayload.sub).toBe('user_01H_workos_generated')

    userServiceMock.findOne.mockResolvedValue(undefined)
    userServiceMock.create.mockResolvedValue({
      id: 'user_01H_workos_generated',
      name: 'WorkOS fallback user',
      email: 'fallback@example.com',
      emailVerified: true,
      role: 'user',
    })

    const request = makeRequest()
    const result = await strategy.validate(request, verifiedPayload)

    // No daytona_user_id → fall back to sub.
    expect(userServiceMock.findOne).toHaveBeenCalledWith('user_01H_workos_generated')
    expect(userServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_01H_workos_generated',
        email: 'fallback@example.com',
        emailVerified: true,
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user_01H_workos_generated',
        email: 'fallback@example.com',
        organizationId: 'test-org-id',
      }),
    )
  })

  it('rejects a JWT signed by a foreign RSA key (JWKS gate is real)', async () => {
    const iat = nowSec()
    const exp = iat + 60

    // Same shape as a legitimate token, but signed with a keypair whose
    // public JWK is NOT published by the mock JWKS endpoint.
    const badJwt = await new SignJWT({
      daytona_user_id: 'auth0|attacker',
      email: 'attacker@example.com',
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user_01H_forged')
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(foreignPrivateKey)

    await expect(strategy.verifyToken(badJwt)).rejects.toThrow()

    // Cross-check: neither user lookup nor creation was ever reached.
    expect(userServiceMock.findOne).not.toHaveBeenCalled()
    expect(userServiceMock.create).not.toHaveBeenCalled()
  })
})

import { Test, type TestingModule } from '@nestjs/testing'
import { JwtStrategy } from './jwt.strategy'
import { AuthStrategyType } from './enums/auth-strategy-type.enum'
import type { RequestWithAuthMetadata } from './interfaces/request-with-auth-metadata.interface'
import { CustomHeaders } from '../common/constants/header.constants'
import { TypedConfigService } from '../config/typed-config.service'
import { UserService } from '../user/user.service'

describe('JwtStrategy', () => {
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
        jwksUri: 'http://example.com/jwks',
        audience: 'test',
        issuer: 'test',
      },
      testingModule.get(UserService),
      testingModule.get(TypedConfigService),
    )
  })

  describe('daytona_user_id claim handling', () => {
    it('uses daytona_user_id as the canonical user ID when the claim is present', async () => {
      userServiceMock.findOne.mockResolvedValue({
        id: 'auth0|test-poc-user',
        name: 'PoC User',
        email: 'poc@example.com',
        emailVerified: true,
        role: 'user',
      })

      const request = Object.create(null) as RequestWithAuthMetadata
      request.authMetadata = {
        isStrategyAllowed: (type: AuthStrategyType) => type === AuthStrategyType.JWT,
      }
      request.get = jest.fn().mockReturnValue('test-org-id')
      const payload = {
        daytona_user_id: 'auth0|test-poc-user',
        sub: 'user_01H...',
        email: 'poc@example.com',
        name: 'PoC User',
        email_verified: true,
      }

      const result = await strategy.validate(request, payload)

      expect(request.get).toHaveBeenCalledWith(CustomHeaders.ORGANIZATION_ID.name)
      expect(userServiceMock.findOne).toHaveBeenCalledWith('auth0|test-poc-user')
      expect(result).toEqual(expect.objectContaining({ userId: 'auth0|test-poc-user' }))
    })
  })

  describe('sub fallback', () => {
    it('uses sub as the canonical user ID when daytona_user_id is missing', async () => {
      userServiceMock.findOne.mockResolvedValue(undefined)
      userServiceMock.create.mockResolvedValue({
        id: 'user_01H...',
        name: 'WorkOS fallback user',
        email: 'fallback@example.com',
        emailVerified: true,
        role: 'user',
      })

      const request = Object.create(null) as RequestWithAuthMetadata
      request.authMetadata = {
        isStrategyAllowed: (type: AuthStrategyType) => type === AuthStrategyType.JWT,
      }
      request.get = jest.fn().mockReturnValue('test-org-id')
      const payload = {
        sub: 'user_01H...',
        email: 'fallback@example.com',
        name: 'WorkOS fallback user',
        email_verified: true,
      }

      await strategy.validate(request, payload)

      expect(request.get).toHaveBeenCalledWith(CustomHeaders.ORGANIZATION_ID.name)
      expect(userServiceMock.findOne).toHaveBeenCalledWith('user_01H...')
      expect(userServiceMock.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_01H...' }))
    })
  })
})

/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Post, Query, Res, UseGuards, Req, UnauthorizedException, Session } from '@nestjs/common'
import { Request } from 'express'
import { ApiTags, ApiOperation, ApiResponse, ApiExtraModels } from '@nestjs/swagger'
import { Response } from 'express'
import { randomBytes } from 'crypto'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { OidcService } from './services/oidc.service'
import { BackofficeUserService } from './services/backoffice-user.service'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../common/guards/flexible-auth.guard'
import { AuditService } from '../audit/audit.service'
import { AuditAction } from '../audit/enums/audit-action.enum'
import { AuditTarget } from '../audit/enums/audit-target.enum'
import { AuthMeResponseDto, AuthRefreshResponseDto, AuthUserDto, AuthRefreshDataDto } from './dto/auth-user.dto'
import { PermissionsDto } from './dto/permissions.dto'

@Controller('auth')
@ApiTags('authentication')
@ApiExtraModels(PermissionsDto, AuthUserDto, AuthMeResponseDto, AuthRefreshDataDto, AuthRefreshResponseDto)
export class AuthController {
  constructor(
    private readonly oidcService: OidcService,
    private readonly userService: BackofficeUserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  @Get('login')
  @ApiOperation({ summary: 'Initiate OAuth login' })
  login(@Res() res: Response, @Session() session: Record<string, any>) {
    try {
      const state = randomBytes(16).toString('hex')

      // SECURITY: Store state in session for CSRF protection
      session.oauth_state = state

      const authUrl = this.oidcService.getAuthorizationUrl(state)
      res.redirect(authUrl)
    } catch (error) {
      const frontendUrl = this.configService.get('frontend.url') || 'http://localhost:8000'
      res.redirect(`${frontendUrl}?error=oidc_not_configured`)
    }
  }

  @Get('callback')
  @ApiOperation({ summary: 'OAuth callback' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
    @Session() session: Record<string, any>,
    @Req() req: Request,
  ) {
    const frontendUrl = this.configService.get('frontend.url') || 'http://localhost:8000'

    if (error) {
      return res.redirect(`${frontendUrl}?error=oauth_failed`)
    }

    // SECURITY FIX #1: Validate state parameter (CSRF protection)
    if (!state || !session.oauth_state || state !== session.oauth_state) {
      return res.redirect(`${frontendUrl}?error=invalid_state`)
    }

    // Clean up state after validation
    delete session.oauth_state

    if (!code) {
      return res.redirect(`${frontendUrl}?error=no_code`)
    }

    try {
      // Exchange code for tokens (client_secret used here, server-side only!)
      const redirectUri = this.configService.get('oidc.redirectUri')
      const tokenSet = await this.oidcService.handleCallback(code, redirectUri, state)

      // Get user info from OIDC provider
      const userInfo = await this.oidcService.getUserInfo(tokenSet)

      // WHITELIST CHECK: Reject if not in backoffice_user table
      const backofficeUser = await this.userService.findByEmail(userInfo.email)

      if (!backofficeUser) {
        return res.redirect(`${frontendUrl}?error=not_whitelisted&email=${encodeURIComponent(userInfo.email)}`)
      }

      // Update last login
      await this.userService.updateLastLogin(backofficeUser.id)

      // Update user name if changed
      const newName = userInfo.name || userInfo.username
      if (newName && (backofficeUser.name === 'Unknown' || backofficeUser.name !== newName)) {
        await this.userService.update(backofficeUser.id, {
          name: newName,
        })
      }

      // Issue OUR OWN session JWT
      const sessionToken = this.jwtService.sign({
        sub: backofficeUser.id,
        email: backofficeUser.email,
        name: backofficeUser.name,
        permissions: backofficeUser.permissions ?? {},
      })

      // Set HTTP-only cookie
      res.cookie('backoffice_session', sessionToken, {
        httpOnly: true, // XSS protection
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // CSRF protection
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: '/',
      })

      // Log the login event
      await this.auditService.createLog({
        actorId: backofficeUser.id,
        actorEmail: backofficeUser.email,
        action: AuditAction.LOGIN,
        targetType: AuditTarget.USER,
        targetId: backofficeUser.id,
        statusCode: 302,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      })

      // Redirect to dashboard
      res.redirect(frontendUrl)
    } catch (error) {
      console.error('OAuth callback error:', error)
      res.redirect(`${frontendUrl}?error=auth_failed`)
    }
  }

  @Get('logout')
  @ApiOperation({ summary: 'Logout' })
  logout(@Res() res: Response) {
    const frontendUrl = this.configService.get('frontend.url') || 'http://localhost:8000'
    res.clearCookie('backoffice_session', { path: '/' })
    res.redirect(frontendUrl)
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh session token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully', type: AuthRefreshResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired session' })
  async refresh(@Req() req: Request, @Res() res: Response) {
    const cookie = req.cookies?.['backoffice_session']
    if (!cookie) {
      res.clearCookie('backoffice_session', { path: '/' })
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_009',
          message: 'No session found',
        },
      })
    }

    try {
      // Verify signature only — accept tokens past `exp` so users coming back
      // to a backgrounded tab can slide their session forward without an OAuth
      // round-trip. The hard cap on `iat` below bounds how far back we'll
      // resurrect, and the DB lookup that follows is still the actual
      // revocation gate.
      const payload = await this.jwtService.verifyAsync(cookie, { ignoreExpiration: true })

      const issuedAtMs = (payload.iat ?? 0) * 1000
      const maxRefreshAgeMs = this.configService.getOrThrow<number>('jwt.maxRefreshAgeSeconds') * 1000
      if (!issuedAtMs || Date.now() - issuedAtMs > maxRefreshAgeMs) {
        res.clearCookie('backoffice_session', { path: '/' })
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'AUTH_012',
            message: 'Session too old; please sign in again',
          },
        })
      }

      // DB lookup only happens here on refresh, not on every request
      const user = await this.userService.findByEmail(payload.email)
      if (!user || !user.isActive) {
        res.clearCookie('backoffice_session', { path: '/' })
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'AUTH_010',
            message: 'User inactive or not found',
          },
        })
      }

      // Issue fresh token with current permissions from DB
      const newToken = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        name: user.name,
        permissions: user.permissions ?? {},
      })

      res.cookie('backoffice_session', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
      })

      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            permissions: user.permissions ?? {},
          },
        },
      })
    } catch (error) {
      res.clearCookie('backoffice_session', { path: '/' })
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_011',
          message: 'Session expired',
        },
      })
    }
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({ status: 200, description: 'Returns current user info', type: AuthMeResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(FlexibleAuthGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<AuthMeResponseDto> {
    return {
      success: true,
      data: req.user as AuthMeResponseDto['data'],
    }
  }
}

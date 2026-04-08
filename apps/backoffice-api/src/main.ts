/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { config } from './config/env'
import { getOpenApiConfig } from './openapi.config'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import { DataSource, MigrationExecutor } from 'typeorm'
import { getDataSourceToken } from '@nestjs/typeorm'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { Organization } from '@api/organization/entities/organization.entity'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'

async function bootstrap() {
  try {
    console.log('🚀 Starting Daytona Backoffice API Server...')

    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    })

    // CLI support for backoffice database migrations
    if (process.argv.length > 2 && process.argv[2].startsWith('--migration-')) {
      const dataSource = app.get(getDataSourceToken('backoffice'))
      dataSource.setOptions({ logging: true })
      const migrationExecutor = new MigrationExecutor(dataSource)

      switch (process.argv[2]) {
        case '--migration-run':
          await migrationExecutor.executePendingMigrations()
          break
        case '--migration-revert':
          await migrationExecutor.undoLastMigration()
          break
        default:
          Logger.error('Invalid migration flag')
          process.exit(1)
      }

      process.exit(0)
    }

    // Trust proxy so Express sees the real protocol behind ALB/reverse proxy
    app.getHttpAdapter().getInstance().set('trust proxy', 1)

    // Security
    app.use(helmet())
    app.use(cookieParser())
    app.use(
      session({
        secret: config.jwt.secret, // Reuse JWT secret for session encryption
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          sameSite: 'lax',
          maxAge: 5 * 60 * 1000, // 5 minutes for OAuth flow
        },
      }),
    )

    // CORS
    app.enableCors({
      origin: config.cors.origin,
      credentials: true,
    })

    // Validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    )

    // Global prefix
    app.setGlobalPrefix('api/v1')

    // OpenAPI/Swagger
    const swaggerConfig = getOpenApiConfig()

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [Sandbox, Runner, Snapshot, Organization, OrganizationUser, RegionQuota],
    })
    SwaggerModule.setup('api-docs', app, document, {
      customSiteTitle: 'Daytona Backoffice API Docs',
      customCss: '.swagger-ui .topbar { display: none }',
    })

    // Start server
    await app.listen(config.port)

    console.log(`✓ Server running on port ${config.port}`)
    console.log(`✓ Environment: ${config.nodeEnv}`)
    console.log(`✓ API available at http://localhost:${config.port}/api/v1`)
    console.log(`✓ OpenAPI docs at http://localhost:${config.port}/api-docs`)
    console.log(`✓ Health check at http://localhost:${config.port}/health`)
    console.log('\n📝 Available endpoints:')
    console.log('  POST /api/v1/sandboxes/search')
    console.log('  POST /api/v1/runners/search')
    console.log('  POST /api/v1/snapshots/search')
    console.log('  POST /api/v1/organizations/search')
    console.log('  POST /api/v1/organization-users/search')
    console.log(`\n🔑 Basic Auth: ${config.basicAuth.username} / ${config.basicAuth.password}`)
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

bootstrap()

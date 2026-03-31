#!/usr/bin/env ts-node
/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import * as fs from 'fs'
import * as path from 'path'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { Organization } from '@api/organization/entities/organization.entity'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'

async function generateOpenAPI() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error'], // Reduce logging noise
  })

  const config = new DocumentBuilder()
    .setTitle('Daytona Backoffice API')
    .addServer('http://localhost:8080/api/v1')
    .setDescription('Internal API for Daytona backoffice operations - search, bulk updates, and admin tasks')
    .setVersion('1.0.0')
    .setContact('Daytona Platforms Inc.', 'https://www.daytona.io', 'support@daytona.com')
    .addBasicAuth(
      {
        type: 'http',
        scheme: 'basic',
        description: 'Basic authentication with username and password',
      },
      'basicAuth',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token from OIDC login',
      },
      'bearerAuth',
    )
    .addTag('search', 'Search operations for entities')
    .addTag('entities', 'CRUD operations on entities')
    .addTag('bulk', 'Bulk operations on entities')
    .addTag('health', 'Health check endpoints')
    .build()

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [Sandbox, Runner, Snapshot, Organization, OrganizationUser, RegionQuota],
  })

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), 'dist', 'apps', 'backoffice-api')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Write OpenAPI spec
  const outputPath = path.join(outputDir, 'openapi.json')
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2))

  await app.close()
  console.log('✓ OpenAPI specification generated successfully!')
  console.log(`✓ Written to: ${outputPath}`)
  process.exit(0)
}

// Add timeout to prevent hanging
const timeout = setTimeout(() => {
  console.error('❌ Generation timed out after 30 seconds')
  process.exit(1)
}, 30000)

// Clear timeout if process exits normally
process.on('exit', () => {
  clearTimeout(timeout)
})

generateOpenAPI()

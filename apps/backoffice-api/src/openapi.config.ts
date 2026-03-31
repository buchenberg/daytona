/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DocumentBuilder } from '@nestjs/swagger'

const getOpenApiConfig = () =>
  new DocumentBuilder()
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

export { getOpenApiConfig }

/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import type { StringValue } from 'ms'

// Load .env.local from root
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'pass',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'application_ctx',
    logging: process.env.DB_LOGGING === 'true',
    tls: {
      enabled: process.env.DB_TLS_ENABLED === 'true',
      rejectUnauthorized: process.env.DB_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  },

  // Backoffice database (same host as main, different database name)
  backofficeDb: {
    host: process.env.BACKOFFICE_DB_HOST || process.env.DB_HOST || 'db',
    port: parseInt(process.env.BACKOFFICE_DB_PORT || process.env.DB_PORT || '5432', 10),
    username: process.env.BACKOFFICE_DB_USERNAME || process.env.DB_USERNAME || 'user',
    password: process.env.BACKOFFICE_DB_PASSWORD || process.env.DB_PASSWORD || 'pass',
    database: process.env.BACKOFFICE_DB_NAME || 'backoffice',
    logging: process.env.BACKOFFICE_DB_LOGGING === 'true',
    migrationsRun: process.env.BACKOFFICE_DB_MIGRATIONS_RUN === 'true',
    tls: {
      enabled: (process.env.BACKOFFICE_DB_TLS_ENABLED ?? process.env.DB_TLS_ENABLED) === 'true',
      rejectUnauthorized:
        (process.env.BACKOFFICE_DB_TLS_REJECT_UNAUTHORIZED ?? process.env.DB_TLS_REJECT_UNAUTHORIZED) !== 'false',
    },
  },

  auth: {
    mode: process.env.AUTH_MODE || 'both', // 'basic' | 'oidc' | 'both'
  },

  oidc: {
    issuer: process.env.OIDC_ISSUER || 'https://accounts.google.com',
    clientId: process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:8080/api/v1/auth/callback',
    audience: process.env.OIDC_AUDIENCE || '',
    callbackURL: process.env.OIDC_CALLBACK_URL || 'http://localhost:8080/api/v1/auth/callback',
    allowedDomain: process.env.OIDC_ALLOWED_DOMAIN || 'daytona.io',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
    expiresIn: (process.env.JWT_EXPIRES_IN as StringValue) || '7d',
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:8000',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:8000',
  },

  basicAuth: {
    username: process.env.BASIC_AUTH_USERNAME || 'admin',
    password: process.env.BASIC_AUTH_PASSWORD || 'admin',
  },

  externalApi: {
    baseUrl: process.env.EXTERNAL_API_URL || 'https://app.daytona.io/api',
    adminKey: process.env.ADMIN_API_KEY || '',
  },

  admin: {
    organizationId: process.env.ADMIN_ORG_ID || '',
  },
}

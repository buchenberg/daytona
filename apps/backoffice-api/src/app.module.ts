/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ServeStaticModule } from '@nestjs/serve-static'
import { config } from './config/env'
import { join } from 'path'

// Backoffice DB entities
import { AuditLog } from './backoffice-db/entities/audit-log.entity'
import { BackofficeUser } from './backoffice-db/entities/backoffice-user.entity'
import { Conversation } from './chat/entities/conversation.entity'
import { Message } from './chat/entities/message.entity'
import { UserSettings } from './chat/entities/user-settings.entity'
import { ThreadCollaborator } from './chat/entities/thread-collaborator.entity'

// Auth & Audit
import { AuthModule } from './auth/auth.module'
import { AuditModule } from './audit/audit.module'
import { AuditInterceptor } from './audit/audit.interceptor'
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'

// Feature modules
import { OrganizationsModule } from './organizations/organizations.module'
import { SandboxesModule } from './sandboxes/sandboxes.module'
import { RunnersModule } from './runners/runners.module'
import { SnapshotsModule } from './snapshots/snapshots.module'
import { OrganizationUsersModule } from './organization-users/organization-users.module'
import { RegionQuotasModule } from './region-quotas/region-quotas.module'
import { UsersModule } from './users/users.module'
import { ChatModule } from './chat/chat.module'
import { HealthController } from './health.controller'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => config],
    }),

    // Serve backoffice-dashboard static files
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'backoffice-dashboard'),
      exclude: ['/api/{*path}'],
      renderPath: '/{*path}',
      serveStaticOptions: {
        cacheControl: false,
      },
    }),

    // PRIMARY connection - Main database (default)
    TypeOrmModule.forRoot({
      name: 'default',
      type: 'postgres',
      host: config.database.host,
      port: config.database.port,
      username: config.database.username,
      password: config.database.password,
      database: config.database.database,
      autoLoadEntities: true,
      synchronize: false,
      logging: config.database.logging,
      migrationsRun: false,
      entitySkipConstructor: true,
      ssl: config.database.tls.enabled,
      extra: config.database.tls.enabled
        ? { ssl: { rejectUnauthorized: config.database.tls.rejectUnauthorized } }
        : undefined,
    }),

    // SECONDARY connection - Backoffice database
    TypeOrmModule.forRoot({
      name: 'backoffice',
      type: 'postgres',
      host: config.backofficeDb.host,
      port: config.backofficeDb.port,
      username: config.backofficeDb.username,
      password: config.backofficeDb.password,
      database: config.backofficeDb.database,
      entities: [AuditLog, BackofficeUser, Conversation, Message, UserSettings, ThreadCollaborator],
      migrations: [join(__dirname, 'migrations-backoffice/**/*{.ts,.js}')],
      migrationsRun: config.backofficeDb.migrationsRun,
      synchronize: false,
      logging: config.backofficeDb.logging,
      ssl: config.backofficeDb.tls.enabled,
      extra: config.backofficeDb.tls.enabled
        ? { ssl: { rejectUnauthorized: config.backofficeDb.tls.rejectUnauthorized } }
        : undefined,
    }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),

    // Auth & Audit modules
    AuthModule,
    AuditModule,

    // Feature modules
    OrganizationsModule,
    SandboxesModule,
    RunnersModule,
    SnapshotsModule,
    OrganizationUsersModule,
    RegionQuotasModule,
    UsersModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

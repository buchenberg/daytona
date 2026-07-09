/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ComponentType } from 'react'
import {
  Database,
  Server,
  Camera,
  Building2,
  Users,
  MapPin,
  UserCircle,
  ClipboardList,
  MessageCircle,
  LucideIcon,
} from 'lucide-react'
import { hasPermission, PermissionResource, Permissions } from '@backoffice-api/permissions'
import { SandboxesPage } from './pages/SandboxesPage'
import { RunnersPage } from './pages/RunnersPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { OrganizationUsersPage } from './pages/OrganizationUsersPage'
import { RegionQuotasPage } from './pages/RegionQuotasPage'
import { UsersPage } from './pages/UsersPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { ChatPage } from './pages/ChatPage'

export interface AppRoute {
  path: string
  name: string
  icon: LucideIcon
  requires: PermissionResource
  component: ComponentType
}

// Single source of truth: the router, the sidebar, and the post-login
// landing page all derive from this list. Order is route precedence —
// the first entry a user has access to is where `/` lands.
export const APP_ROUTES: readonly AppRoute[] = [
  { path: '/sandboxes', name: 'Sandboxes', icon: Database, requires: 'sandboxes', component: SandboxesPage },
  { path: '/runners', name: 'Runners', icon: Server, requires: 'runners', component: RunnersPage },
  { path: '/snapshots', name: 'Snapshots', icon: Camera, requires: 'snapshots', component: SnapshotsPage },
  {
    path: '/organizations',
    name: 'Organizations',
    icon: Building2,
    requires: 'organizations',
    component: OrganizationsPage,
  },
  {
    path: '/organization-users',
    name: 'Organization Users',
    icon: Users,
    requires: 'organizationUsers',
    component: OrganizationUsersPage,
  },
  {
    path: '/region-quotas',
    name: 'Region Quotas',
    icon: MapPin,
    requires: 'regionQuotas',
    component: RegionQuotasPage,
  },
  { path: '/users', name: 'Users', icon: UserCircle, requires: 'users', component: UsersPage },
  { path: '/audit-logs', name: 'Audit Logs', icon: ClipboardList, requires: 'auditLogs', component: AuditLogsPage },
  { path: '/chat', name: 'mali', icon: MessageCircle, requires: 'maliDatasources', component: ChatPage },
]

export function canAccessRoute(permissions: Permissions, route: AppRoute): boolean {
  return hasPermission(permissions, route.requires, '*')
}

export function firstAccessibleRoute(permissions: Permissions): AppRoute | null {
  return APP_ROUTES.find((r) => canAccessRoute(permissions, r)) ?? null
}

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
  Bell,
  BookOpen,
  Warehouse,
  Wrench,
  LucideIcon,
} from 'lucide-react'
import { hasPermission, isSuperAdmin, PermissionResource, Permissions } from '@backoffice-api/permissions'
import { SandboxesPage } from './pages/SandboxesPage'
import { RunnersPage } from './pages/RunnersPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { OrganizationUsersPage } from './pages/OrganizationUsersPage'
import { RegionQuotasPage } from './pages/RegionQuotasPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { UsersPage } from './pages/UsersPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { ChatPage } from './pages/ChatPage'
import { KnowledgeBankPage } from './pages/KnowledgeBankPage'
import { FleetPage } from './pages/FleetPage'
import { FleetRunnerDetailPage } from './pages/FleetRunnerDetailPage'
import { MaintenanceRequestDetailPage } from './pages/MaintenanceRequestDetailPage'

export interface AppRoute {
  path: string
  name: string
  icon: LucideIcon
  /** Resource(s) granting access — an array means any one of them suffices. */
  requires: PermissionResource | PermissionResource[]
  superAdminOnly?: boolean
  component: ComponentType
}

// Single source of truth: the router, the sidebar, and the post-login
// landing page all derive from this list. Order is route precedence —
// the first entry a user has access to is where `/` lands.
export const APP_ROUTES: readonly AppRoute[] = [
  { path: '/sandboxes', name: 'Sandboxes', icon: Database, requires: 'sandboxes', component: SandboxesPage },
  { path: '/runners', name: 'Runners', icon: Server, requires: 'runners', component: RunnersPage },
  { path: '/fleet', name: 'Fleet', icon: Warehouse, requires: 'fleet', component: FleetPage },
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
  {
    path: '/knowledge-bank',
    name: 'Knowledge Bank',
    icon: BookOpen,
    requires: 'maliDatasources',
    superAdminOnly: true,
    component: KnowledgeBankPage,
  },
]

// Reached from the Header bell rather than the sidebar, so it lives outside
// APP_ROUTES (which drives the sidebar and post-login landing precedence).
// Shows quota-request and incoming-maintenance notifications, so either
// resource grants access.
export const NOTIFICATIONS_ROUTE: AppRoute = {
  path: '/notifications',
  name: 'Notifications',
  icon: Bell,
  requires: ['regionQuotas', 'fleet'],
  component: NotificationsPage,
}

// Detail pages reached from links inside the fleet/maintenance pages, not the
// sidebar. Same access rules as their parent list pages.
export const DETAIL_ROUTES: readonly AppRoute[] = [
  { path: '/fleet/:name', name: 'Fleet Runner', icon: Warehouse, requires: 'fleet', component: FleetRunnerDetailPage },
  {
    path: '/maintenance-requests/:id',
    name: 'Maintenance Request',
    icon: Wrench,
    requires: 'fleet',
    component: MaintenanceRequestDetailPage,
  },
]

export function canAccessRoute(permissions: Permissions, route: AppRoute): boolean {
  if (route.superAdminOnly) return isSuperAdmin(permissions)
  const required = Array.isArray(route.requires) ? route.requires : [route.requires]
  return required.some((resource) => hasPermission(permissions, resource, '*'))
}

export function firstAccessibleRoute(permissions: Permissions): AppRoute | null {
  return APP_ROUTES.find((r) => canAccessRoute(permissions, r)) ?? null
}

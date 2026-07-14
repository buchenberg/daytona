import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { NotificationSocketProvider } from '@/providers/NotificationSocketProvider'
import { OrganizationsProvider } from '@/providers/OrganizationsProvider'
import { SelectedOrganizationProvider } from '@/providers/SelectedOrganizationProvider'
import { initPylon } from '@/vendor/pylon'
import { OrganizationRolePermissionsEnum, OrganizationUserRoleEnum } from '@daytona/api-client'
import { ShieldAlert } from 'lucide-react'
import { useFeatureFlagEnabled, usePostHog } from 'posthog-js/react'
import { Suspense, useEffect, type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  redirect,
  useLocation,
  useNavigation,
  useRouteError,
} from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { BannerProvider } from './components/Banner'
import { CommandPaletteProvider } from './components/CommandPalette'
import { ErrorBoundaryFallback } from './components/ErrorBoundaryFallback'
import LoadingFallback from './components/LoadingFallback'
import { LoadingFallbackContent } from './components/LoadingFallbackContent'
import { PageContent, PageHeader, PageIntro, PageLayout } from './components/PageLayout'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './components/ui/empty'
import { DAYTONA_DOCS_URL, DAYTONA_SLACK_URL } from './constants/Links'
import { FeatureFlags } from './enums/FeatureFlags'
import { routes } from './routes/paths'
import { useConfig } from './hooks/useConfig'
import Dashboard from './pages/Dashboard'
import LandingPage from './pages/LandingPage'
import Logout from './pages/Logout'
import NotFound from './pages/NotFound'

import { ApiProvider } from './providers/ApiProvider'
import { SvixProvider } from './providers/SvixProvider'
import { lazyRoutes } from './routes'

function normalizeRouteError(error: unknown) {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string') {
    return new Error(error)
  }

  return new Error('Unknown route error')
}

function RouteErrorFallback() {
  const error = useRouteError()

  return (
    <ErrorBoundaryFallback error={normalizeRouteError(error)} resetErrorBoundary={() => window.location.reload()} />
  )
}

function AppRoot() {
  const config = useConfig()
  const location = useLocation()
  const posthog = usePostHog()

  const { error: authError, isAuthenticated, signoutRedirect, user } = useAuth()

  useEffect(() => {
    if (isAuthenticated && user && posthog?.get_distinct_id() !== user.profile.sub) {
      posthog?.identify(user.profile.sub, {
        email: user.profile.email,
        name: user.profile.name,
      })
    }
    if (import.meta.env.PROD && config.pylonAppId && isAuthenticated && user) {
      initPylon(config.pylonAppId, {
        chat_settings: {
          app_id: config.pylonAppId,
          email: user.profile.email || '',
          name: user.profile.name || '',
          avatar_url: user.profile.picture,
          email_hash: user.profile?.email_hash as string | undefined,
        },
      })
    }
  }, [isAuthenticated, user, posthog, config.pylonAppId])

  // Hack for tracking PostHog pageviews in SPAs
  useEffect(() => {
    if (import.meta.env.PROD) {
      posthog?.capture('$pageview', {
        $current_url: window.location.href,
      })
    }
  }, [location, posthog])

  if (authError) {
    return (
      <Dialog open>
        <DialogContent className="[&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Authentication Error</DialogTitle>
            <DialogDescription>{authError.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => signoutRedirect()}>Go Back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return <Outlet />
}

function DashboardOutlet() {
  const location = useLocation()
  const navigation = useNavigation()
  const isRouteLoading = navigation.state === 'loading' && navigation.location?.pathname !== location.pathname

  return (
    <Suspense fallback={<LoadingFallback source="dashboard-suspense" />}>
      <ApiProvider>
        <OrganizationsProvider>
          <SelectedOrganizationProvider>
            <NotificationSocketProvider>
              <CommandPaletteProvider>
                <BannerProvider>
                  <Dashboard>
                    {isRouteLoading ? (
                      <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
                        <LoadingFallbackContent source="route-navigation" />
                      </div>
                    ) : (
                      <Outlet />
                    )}
                  </Dashboard>
                </BannerProvider>
              </CommandPaletteProvider>
            </NotificationSocketProvider>
          </SelectedOrganizationProvider>
        </OrganizationsProvider>
      </ApiProvider>
    </Suspense>
  )
}

function DashboardIndexRedirect() {
  const location = useLocation()

  return <Navigate to={`${routes.sandboxes.segment}${location.search}`} replace />
}

function getAccessLabel(access: string) {
  return access.replace(/[:_-]+/g, ' ').toLowerCase()
}

function AccessRequiredPage({ pageTitle, requiredAccess }: { pageTitle: ReactNode; requiredAccess: string[] }) {
  return (
    <PageLayout>
      <PageHeader />
      <PageContent>
        <PageIntro title={pageTitle} />
        <Empty className="flex-none rounded-md border py-12" variant="warning">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>You don&apos;t have access to this page</EmptyTitle>
            <EmptyDescription>Ask your organization owner to grant you the required access.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="text-xs font-medium text-muted-foreground">Required access</div>
            <div className="flex flex-wrap justify-center gap-2">
              {requiredAccess.map((access) => (
                <Badge key={access} className="capitalize" title={access}>
                  {getAccessLabel(access)}
                </Badge>
              ))}
            </div>
          </EmptyContent>
        </Empty>
      </PageContent>
    </PageLayout>
  )
}

function OwnerAccessOrganizationPageWrapper({ children, pageTitle }: { children: ReactNode; pageTitle: ReactNode }) {
  const { authenticatedUserOrganizationMember } = useSelectedOrganization()

  if (authenticatedUserOrganizationMember?.role !== OrganizationUserRoleEnum.OWNER) {
    return <AccessRequiredPage pageTitle={pageTitle} requiredAccess={['owner role']} />
  }

  return children
}

function RequiredPermissionsOrganizationPageWrapper({
  children,
  pageTitle,
  requiredPermissions,
}: {
  children: ReactNode
  pageTitle: ReactNode
  requiredPermissions: OrganizationRolePermissionsEnum[]
}) {
  const { authenticatedUserHasPermission } = useSelectedOrganization()
  const missingPermissions = requiredPermissions.filter((permission) => {
    return !authenticatedUserHasPermission(permission)
  })

  if (missingPermissions.length > 0) {
    return <AccessRequiredPage pageTitle={pageTitle} requiredAccess={missingPermissions} />
  }

  return children
}

function RequiredFeatureFlagWrapper({ children, flagKey }: { children: ReactNode; flagKey: FeatureFlags }) {
  const flagEnabled = useFeatureFlagEnabled(flagKey)

  if (!flagEnabled) {
    return <Navigate to={routes.dashboard.path} replace />
  }

  return children
}

function OwnerAccessOrganizationOutlet({ pageTitle }: { pageTitle: ReactNode }) {
  return (
    <OwnerAccessOrganizationPageWrapper pageTitle={pageTitle}>
      <Outlet />
    </OwnerAccessOrganizationPageWrapper>
  )
}

function RequiredPermissionsOrganizationOutlet({
  pageTitle,
  requiredPermissions,
}: {
  pageTitle: ReactNode
  requiredPermissions: OrganizationRolePermissionsEnum[]
}) {
  return (
    <RequiredPermissionsOrganizationPageWrapper pageTitle={pageTitle} requiredPermissions={requiredPermissions}>
      <Outlet />
    </RequiredPermissionsOrganizationPageWrapper>
  )
}

function RequiredFeatureFlagOutlet({ flagKey }: { flagKey: FeatureFlags }) {
  return (
    <RequiredFeatureFlagWrapper flagKey={flagKey}>
      <Outlet />
    </RequiredFeatureFlagWrapper>
  )
}

function BillingEnabledOutlet() {
  const config = useConfig()

  if (!config.billingApiUrl) {
    return <Navigate to={routes.dashboard.path} replace />
  }

  return <Outlet />
}

function BillingOwnerAccessOutlet({ pageTitle }: { pageTitle: ReactNode }) {
  const config = useConfig()

  if (!config.billingApiUrl) {
    return <Navigate to={routes.dashboard.path} replace />
  }

  return (
    <OwnerAccessOrganizationPageWrapper pageTitle={pageTitle}>
      <Outlet />
    </OwnerAccessOrganizationPageWrapper>
  )
}

function RunnersAccessOutlet() {
  return (
    <RequiredFeatureFlagWrapper flagKey={FeatureFlags.ORGANIZATION_INFRASTRUCTURE}>
      <RequiredPermissionsOrganizationPageWrapper
        pageTitle="Runners"
        requiredPermissions={[OrganizationRolePermissionsEnum.READ_RUNNERS]}
      >
        <Outlet />
      </RequiredPermissionsOrganizationPageWrapper>
    </RequiredFeatureFlagWrapper>
  )
}

function WebhooksOutlet() {
  return (
    <SvixProvider>
      <Outlet />
    </SvixProvider>
  )
}

const router = createBrowserRouter([
  {
    path: routes.landing.path,
    element: <AppRoot />,
    hydrateFallbackElement: <LoadingFallback source="app-root-hydrate" />,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: routes.logout.segment, element: <Logout /> },
      { path: routes.docs.segment, loader: () => redirect(DAYTONA_DOCS_URL) },
      { path: routes.slack.segment, loader: () => redirect(DAYTONA_SLACK_URL) },
      {
        path: routes.dashboard.segment,
        element: <DashboardOutlet />,
        children: [
          { index: true, element: <DashboardIndexRedirect /> },
          { path: routes.keys.segment, lazy: lazyRoutes.Keys },
          {
            path: routes.secrets.segment,
            element: (
              <RequiredPermissionsOrganizationOutlet
                pageTitle="Secrets"
                requiredPermissions={['manage:secrets' as OrganizationRolePermissionsEnum]}
              />
            ),
            children: [{ index: true, lazy: lazyRoutes.Secrets }],
          },
          { path: routes.sandboxes.segment, lazy: lazyRoutes.Sandboxes },
          { path: routes.sandboxDetails.segment, lazy: lazyRoutes.SandboxDetails },
          { path: routes.snapshots.segment, lazy: lazyRoutes.Snapshots },
          { path: routes.registries.segment, lazy: lazyRoutes.Registries },
          {
            path: routes.volumes.segment,
            element: (
              <RequiredPermissionsOrganizationOutlet
                pageTitle="Volumes"
                requiredPermissions={[OrganizationRolePermissionsEnum.READ_VOLUMES]}
              />
            ),
            children: [{ index: true, lazy: lazyRoutes.Volumes }],
          },
          {
            path: routes.limits.segment,
            element: (
              <RequiredPermissionsOrganizationOutlet
                pageTitle="Limits"
                requiredPermissions={[OrganizationRolePermissionsEnum.READ_LIMITS]}
              />
            ),
            children: [{ index: true, lazy: lazyRoutes.Limits }],
          },
          {
            path: routes.billingSpending.segment,
            element: <BillingOwnerAccessOutlet pageTitle="Spending" />,
            children: [{ index: true, lazy: lazyRoutes.Spending }],
          },
          {
            path: routes.billingWallet.segment,
            element: <BillingOwnerAccessOutlet pageTitle="Wallet" />,
            children: [{ index: true, lazy: lazyRoutes.Wallet }],
          },
          {
            path: routes.emailVerify.segment,
            element: <BillingEnabledOutlet />,
            children: [{ index: true, lazy: lazyRoutes.EmailVerify }],
          },
          { path: routes.members.segment, lazy: lazyRoutes.OrganizationMembers },
          {
            path: routes.auditLogs.segment,
            element: (
              <RequiredPermissionsOrganizationOutlet
                pageTitle="Audit Logs"
                requiredPermissions={[OrganizationRolePermissionsEnum.READ_AUDIT_LOGS]}
              />
            ),
            children: [{ index: true, lazy: lazyRoutes.AuditLogs }],
          },
          { path: routes.settings.segment, lazy: lazyRoutes.OrganizationSettings },
          {
            path: routes.regions.segment,
            element: <RequiredFeatureFlagOutlet flagKey={FeatureFlags.ORGANIZATION_INFRASTRUCTURE} />,
            children: [{ index: true, lazy: lazyRoutes.Regions }],
          },
          {
            path: routes.runners.segment,
            element: <RunnersAccessOutlet />,
            children: [{ index: true, lazy: lazyRoutes.Runners }],
          },
          { path: routes.accountSettings.segment, lazy: lazyRoutes.AccountSettings },
          { path: routes.userInvitations.segment, lazy: lazyRoutes.UserOrganizationInvitations },
          { path: routes.onboarding.segment, lazy: lazyRoutes.Onboarding },
          { path: routes.playground.segment, lazy: lazyRoutes.Playground },
          {
            path: routes.webhooks.segment,
            element: <WebhooksOutlet />,
            children: [
              { index: true, lazy: lazyRoutes.Webhooks },
              { path: routes.webhookEndpointDetails.segment, lazy: lazyRoutes.WebhookEndpointDetails },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App

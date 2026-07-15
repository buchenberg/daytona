import { ReactNode, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './contexts/ThemeContext'
import { ConfigProvider } from './providers/ConfigProvider'
import { ApiProvider, usePermissions } from './providers/ApiProvider'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { CautionBanner } from './components/layout/CautionBanner'
import { SidebarProvider, SidebarInset, useSidebar } from '@dashboard/ui/sidebar'
import { BannerProvider } from '@dashboard/components/Banner'
import { Toaster } from 'sonner'
import {
  APP_ROUTES,
  DETAIL_ROUTES,
  NOTIFICATIONS_ROUTE,
  AppRoute,
  canAccessRoute,
  firstAccessibleRoute,
} from './routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

function SidebarAutoCollapse() {
  const location = useLocation()
  const { setOpen } = useSidebar()
  const isChat = location.pathname === '/chat'
  useEffect(() => {
    setOpen(!isChat)
  }, [isChat, setOpen])
  return null
}

function ProtectedRoute({ route, children }: { route: AppRoute; children: ReactNode }) {
  const permissions = usePermissions()
  if (canAccessRoute(permissions, route)) return <>{children}</>
  const fallback = firstAccessibleRoute(permissions)
  return fallback ? <Navigate to={fallback.path} replace /> : <NoAccess />
}

function HomeRedirect() {
  const permissions = usePermissions()
  const fallback = firstAccessibleRoute(permissions)
  return fallback ? <Navigate to={fallback.path} replace /> : <NoAccess />
}

function NoAccess() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center max-w-md p-8">
        <h1 className="text-xl font-semibold mb-2">No access</h1>
        <p className="text-muted-foreground text-sm">
          Your account doesn&apos;t have permission to view any backoffice resources. Ask an administrator to grant you
          access.
        </p>
      </div>
    </div>
  )
}

function Dashboard() {
  const location = useLocation()
  const isChat = location.pathname === '/chat'

  return (
    <SidebarProvider defaultOpen={!isChat} isBannerVisible={false}>
      <SidebarAutoCollapse />
      <Sidebar />
      <SidebarInset className="overflow-hidden">
        <div className={`flex flex-col w-full ${isChat ? 'h-screen' : 'min-h-screen'}`}>
          <Header />
          <CautionBanner />
          <main className={`flex-1 bg-background ${isChat ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              {[...APP_ROUTES, ...DETAIL_ROUTES, NOTIFICATIONS_ROUTE].map((route) => {
                const Page = route.component
                return (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={
                      <ProtectedRoute route={route}>
                        <Page />
                      </ProtectedRoute>
                    }
                  />
                )
              })}
              <Route path="*" element={<HomeRedirect />} />
            </Routes>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="backoffice-theme">
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </div>
          }
        >
          <ConfigProvider>
            <BrowserRouter>
              <ApiProvider>
                <BannerProvider>
                  <Dashboard />
                </BannerProvider>
              </ApiProvider>
              <Toaster />
            </BrowserRouter>
          </ConfigProvider>
        </Suspense>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App

/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './contexts/ThemeContext'
import { ConfigProvider } from './providers/ConfigProvider'
import { ApiProvider } from './providers/ApiProvider'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { CautionBanner } from './components/layout/CautionBanner'
import { SidebarProvider, SidebarInset, useSidebar } from '@dashboard/ui/sidebar'
import { BannerProvider } from '@dashboard/components/Banner'
import { SandboxesPage } from './pages/SandboxesPage'
import { RunnersPage } from './pages/RunnersPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { OrganizationUsersPage } from './pages/OrganizationUsersPage'
import { RegionQuotasPage } from './pages/RegionQuotasPage'
import { UsersPage } from './pages/UsersPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { ChatPage } from './pages/ChatPage'
import { Toaster } from 'sonner'
import { useEffect } from 'react'

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
              <Route path="/" element={<Navigate to="/sandboxes" replace />} />
              <Route path="/sandboxes" element={<SandboxesPage />} />
              <Route path="/runners" element={<RunnersPage />} />
              <Route path="/snapshots" element={<SnapshotsPage />} />
              <Route path="/organizations" element={<OrganizationsPage />} />
              <Route path="/organization-users" element={<OrganizationUsersPage />} />
              <Route path="/region-quotas" element={<RegionQuotasPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="*" element={<Navigate to="/sandboxes" replace />} />
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

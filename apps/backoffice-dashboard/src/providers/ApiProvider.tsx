/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import BackofficeApiClient from '../api/BackofficeApiClient'
import { Permissions, PermissionResource, ActionFor, hasPermission, isSuperAdmin } from '@backoffice-api/permissions'

interface AuthUser {
  id: string
  email: string
  name: string
  permissions: Permissions
}

const ApiContext = createContext<typeof BackofficeApiClient | null>(null)
const UserContext = createContext<AuthUser | null>(null)

// Refresh interval: 12 minutes (before 15 min token expiry)
const REFRESH_INTERVAL_MS = 12 * 60 * 1000

// Don't slam /refresh on rapid tab-focus toggling (alt-tab spam, popovers, etc.)
const FOCUS_REFRESH_THROTTLE_MS = 30 * 1000

export const useApi = () => {
  const context = useContext(ApiContext)
  if (!context) throw new Error('useApi must be used within ApiProvider')
  return context
}

export const useUser = () => useContext(UserContext)

export const usePermissions = (): Permissions => useContext(UserContext)?.permissions ?? {}

export const useIsSuperAdmin = (): boolean => isSuperAdmin(usePermissions())

export function useHasPermission<R extends PermissionResource>(resource: R, action: ActionFor<R>): boolean {
  return hasPermission(usePermissions(), resource, action)
}

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const lastRefreshAtRef = useRef<number>(0)
  const navigate = useNavigate()
  const location = useLocation()

  // Refresh session token.
  //   resolves AuthUser  → success, slide forward
  //   resolves null      → genuine 401 (session truly expired) → caller should redirect
  //   throws             → transient (network blip, 5xx, offline) → caller should swallow
  // The narrow contract matters because a brief WiFi blip when returning to a tab
  // would otherwise be indistinguishable from a real session expiry and bounce the
  // user through OAuth.
  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    if (response.status === 401) return null
    if (!response.ok) {
      throw new Error(`Refresh failed with status ${response.status}`)
    }
    const data = await response.json()
    lastRefreshAtRef.current = Date.now()
    return (data?.data?.user as AuthUser) ?? null
  }, [])

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/v1/auth/me', {
          credentials: 'include', // Send cookies
        })

        if (response.ok) {
          const data = await response.json()
          setUser(data?.data ?? null)
          setIsAuthenticated(true)
        } else if (response.status === 401) {
          // Try to refresh the session. A throw here means transient (network /
          // 5xx) — leave the user on the loading screen and don't bounce them.
          try {
            const refreshedUser = await refreshSession()
            if (refreshedUser) {
              setUser(refreshedUser)
              setIsAuthenticated(true)
            } else {
              window.location.href = '/api/v1/auth/login'
            }
          } catch {
            // transient — stay on loading; the next /me load will retry
          }
        } else {
          window.location.href = '/api/v1/auth/login'
        }
      } catch {
        // network error fetching /me — don't bounce; user can refresh the page
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [refreshSession])

  // Periodic session refresh to keep session alive
  useEffect(() => {
    if (!isAuthenticated) return

    const intervalId = setInterval(async () => {
      try {
        const refreshedUser = await refreshSession()
        if (!refreshedUser) {
          // Genuine 401 — session really expired
          window.location.href = '/api/v1/auth/login'
        } else {
          setUser(refreshedUser)
        }
      } catch {
        // Transient network/5xx — let the next tick try again
      }
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [isAuthenticated, refreshSession])

  // Refresh on tab focus. setInterval is throttled / paused in background tabs,
  // so without this a user returning after >15 min hits an expired cookie and
  // would otherwise be bounced through OAuth.
  useEffect(() => {
    if (!isAuthenticated) return

    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return

      try {
        const refreshedUser = await refreshSession()
        if (!refreshedUser) {
          // Genuine 401 — session really expired
          window.location.href = '/api/v1/auth/login'
        } else {
          setUser(refreshedUser)
        }
      } catch {
        // Transient (offline / brief network blip on focus) — don't bounce
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [isAuthenticated, refreshSession])

  // Handle OAuth errors from query params
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const error = params.get('error')

    // SECURITY FIX #3: Don't show unsanitized email to prevent XSS
    if (error === 'not_whitelisted') {
      alert('Access denied. Your email is not whitelisted for backoffice access.')
      window.location.href = '/api/v1/auth/logout'
    } else if (error === 'invalid_state') {
      alert('Security validation failed. Please try logging in again.')
      window.location.href = '/api/v1/auth/login'
    } else if (error === 'oauth_failed' || error === 'auth_failed') {
      alert('Authentication failed. Please try again.')
      window.location.href = '/api/v1/auth/login'
    } else if (error === 'oidc_not_configured') {
      alert('OAuth is not configured. Please contact your administrator.')
    }

    if (error) {
      navigate(location.pathname, { replace: true })
    }
  }, [location.search, navigate, location.pathname])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null // Will redirect
  }

  return (
    <UserContext.Provider value={user}>
      <ApiContext.Provider value={BackofficeApiClient}>{children}</ApiContext.Provider>
    </UserContext.Provider>
  )
}

/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import BackofficeApiClient from '../api/BackofficeApiClient'

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

const ApiContext = createContext<typeof BackofficeApiClient | null>(null)
const UserContext = createContext<AuthUser | null>(null)

// Refresh interval: 12 minutes (before 15 min token expiry)
const REFRESH_INTERVAL_MS = 12 * 60 * 1000

export const useApi = () => {
  const context = useContext(ApiContext)
  if (!context) throw new Error('useApi must be used within ApiProvider')
  return context
}

export const useUser = () => useContext(UserContext)
export const useIsAdmin = () => useContext(UserContext)?.role === 'admin'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Refresh session token; returns user data from the refresh response on success
  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) return null
      const data = await response.json()
      return (data?.data?.user as AuthUser) ?? null
    } catch {
      return null
    }
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
          // Try to refresh the session
          const refreshedUser = await refreshSession()
          if (refreshedUser) {
            setUser(refreshedUser)
            setIsAuthenticated(true)
          } else {
            window.location.href = '/api/v1/auth/login'
          }
        } else {
          window.location.href = '/api/v1/auth/login'
        }
      } catch {
        window.location.href = '/api/v1/auth/login'
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
      const refreshedUser = await refreshSession()
      if (!refreshedUser) {
        // Session expired and couldn't refresh - redirect to login
        window.location.href = '/api/v1/auth/login'
      } else {
        setUser(refreshedUser)
      }
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(intervalId)
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

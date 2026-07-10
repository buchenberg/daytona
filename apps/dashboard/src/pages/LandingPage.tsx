/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import LoadingFallback from '@/components/LoadingFallback'
import { routes } from '@/routes/paths'
import React from 'react'
import { useAuth } from 'react-oidc-context'
import { Navigate, useLocation } from 'react-router'

const LandingPage: React.FC = () => {
  const { signinRedirect, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <LoadingFallback />
  }

  if (isAuthenticated) {
    return <Navigate to={`${routes.dashboard.path}${location.search}`} replace />
  } else {
    void signinRedirect({
      state: {
        returnTo: location.pathname + location.search,
      },
    })
  }
}

export default LandingPage

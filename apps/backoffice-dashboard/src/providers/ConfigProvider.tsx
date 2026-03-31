/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createContext, useContext } from 'react'

interface BackofficeConfig {
  apiUrl: string
}

const ConfigContext = createContext<BackofficeConfig | null>(null)

export const useConfig = () => {
  const context = useContext(ConfigContext)
  if (!context) throw new Error('useConfig must be used within ConfigProvider')
  return context
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const config: BackofficeConfig = {
    apiUrl: '/api/v1',
  }

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
}

import { DashboardConfig } from '@/types/DashboardConfig'
import { createContext } from 'react'

export const ConfigContext = createContext<DashboardConfig | null>(null)

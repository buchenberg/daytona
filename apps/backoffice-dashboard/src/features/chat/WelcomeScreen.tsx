/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ThreadPrimitive } from '@assistant-ui/react'
import { Database, AlertTriangle, Search, BarChart3, Bug } from 'lucide-react'
import type { FC } from 'react'

const suggestions = [
  { label: 'Datasources', message: 'What datasources are available?', icon: Database },
  { label: 'Firing alerts', message: 'Show me all currently firing alerts', icon: AlertTriangle },
  { label: 'Audit logs', message: 'What are the top audit log actions in the last 24 hours?', icon: Search },
  { label: 'PostHog events', message: 'What are the top PostHog events by volume today?', icon: BarChart3 },
  { label: 'Sandbox errors', message: 'Show me sandbox error counts for the last 24 hours', icon: Bug },
]

export const WelcomeScreen: FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
      <div className="mb-6">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <span className="text-xl font-bold text-primary">M</span>
        </div>
        <h2 className="text-2xl font-semibold mb-1">Mali</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Production operations assistant with access to Grafana, Prometheus, Loki, database, OpenSearch, PostHog,
          ClickHouse, and Daytona sandboxes.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {suggestions.map((s) => (
          <ThreadPrimitive.Suggestion
            key={s.label}
            prompt={s.message}
            autoSend
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <s.icon className="h-3 w-3" />
            {s.label}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  )
}

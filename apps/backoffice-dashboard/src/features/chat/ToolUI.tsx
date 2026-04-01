/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, type FC } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ToolCallDisplayProps {
  toolName: string
  args?: Record<string, unknown>
  result?: unknown
  isError?: boolean
}

export const ToolCallDisplay: FC<ToolCallDisplayProps> = ({ toolName, result, isError }) => {
  const [expanded, setExpanded] = useState(false)
  const isRunning = result === undefined

  return (
    <div className="my-2 rounded-lg border bg-background text-xs overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => !isRunning && setExpanded(!expanded)}
        disabled={isRunning}
      >
        {isRunning ? (
          <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
        ) : isError ? (
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0" />
        ) : (
          <div className="h-2.5 w-2.5 rounded-full bg-green-500 flex-shrink-0" />
        )}
        <span className="font-mono text-muted-foreground truncate">{toolName}</span>
        {!isRunning && (
          <span className="ml-auto text-muted-foreground/50 flex-shrink-0">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}
      </button>
      {expanded && result !== undefined && (
        <div className="border-t px-3 py-2 max-h-64 overflow-auto">
          {isError ? (
            <pre className="text-destructive whitespace-pre-wrap break-all">{String(result)}</pre>
          ) : (
            <pre className="whitespace-pre-wrap break-all text-muted-foreground">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

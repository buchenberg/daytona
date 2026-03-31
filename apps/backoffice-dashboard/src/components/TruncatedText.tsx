/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@dashboard/ui/tooltip'
import { cn } from '@backoffice/lib/utils'

interface TruncatedTextProps {
  text: string | null | undefined
  maxLength?: number
  className?: string
}

export const TruncatedText = memo(({ text, maxLength = 30, className }: TruncatedTextProps) => {
  // Handle null/undefined
  if (!text) {
    return <span className={cn('text-muted-foreground', className)}>-</span>
  }

  // If text is within maxLength, no truncation needed
  if (text.length <= maxLength) {
    return <span className={className}>{text}</span>
  }

  // Truncate text
  const truncated = text.substring(0, maxLength) + '...'

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('cursor-help', className)}>{truncated}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[400px] break-words">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})

TruncatedText.displayName = 'TruncatedText'

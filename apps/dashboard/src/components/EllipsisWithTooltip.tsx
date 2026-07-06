/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { cn } from '@/lib/utils'
import { useRender } from '@base-ui/react/use-render'
import { useRef, useState, type ComponentProps } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export function EllipsisWithTooltip({ children, render, className, ...props }: useRender.ComponentProps<'div'>) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)

  return (
    <Tooltip
      open={isOpen}
      onOpenChange={(shouldOpen) => {
        if (shouldOpen) {
          const isTruncated = triggerRef.current && triggerRef.current.scrollWidth > triggerRef.current.clientWidth
          if (isTruncated) {
            setIsOpen(true)
          }
        } else {
          setIsOpen(false)
        }
      }}
      delay={300}
    >
      <TooltipTrigger
        render={render ?? <div />}
        ref={(node: HTMLElement | null) => {
          triggerRef.current = node
        }}
        className={cn('truncate', className)}
        {...(props as ComponentProps<typeof TooltipTrigger>)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

type ResponsiveButtonProps = ComponentProps<typeof Button> & {
  icon: ReactNode
}

/**
 * A Button that collapses to a square icon-only button below the `xs`
 * breakpoint. The label (children) stays in the accessibility tree via
 * `sr-only`, so no separate `aria-label` is needed.
 */
export function ResponsiveButton({ icon, children, className, ...props }: ResponsiveButtonProps) {
  return (
    <Button className={cn('w-8 gap-0 px-0 xs:w-auto xs:gap-1.5 xs:px-3', className)} {...props}>
      {icon}
      <span className="sr-only xs:not-sr-only">{children}</span>
    </Button>
  )
}

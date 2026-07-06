/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ResponsiveButton } from '@/components/ResponsiveButton'
import { Plus } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

type CreateResourceButtonProps = Omit<ComponentProps<typeof ResponsiveButton>, 'render' | 'icon'> & {
  resource: ReactNode
  label?: ReactNode
}

export function CreateResourceButton({ resource, children, label = 'Create', ...props }: CreateResourceButtonProps) {
  return (
    <ResponsiveButton icon={<Plus className="size-4" />} variant="default" size="sm" {...props}>
      {label}
      <span className="hidden sm:inline">&nbsp;{children ?? resource}</span>
    </ResponsiveButton>
  )
}

/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from '@dashboard/ui/sheet'
import { Button } from '@dashboard/ui/button'
import { Filter } from 'lucide-react'

interface FilterDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  onApply?: () => void
  onReset?: () => void
  applyLabel?: string
  resetLabel?: string
}

export function FilterDrawer({
  open,
  onOpenChange,
  title = 'Filters',
  description = 'Apply filters to refine your search',
  children,
  onApply,
  onReset,
  applyLabel = 'Apply Filters',
  resetLabel = 'Reset',
}: FilterDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {title}
          </SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="py-6 space-y-4">{children}</div>

        {(onApply || onReset) && (
          <SheetFooter className="flex-row gap-2 sm:flex-row sm:justify-start">
            {onReset && (
              <Button variant="outline" onClick={onReset} className="flex-1 sm:flex-initial">
                {resetLabel}
              </Button>
            )}
            {onApply && (
              <Button onClick={onApply} className="flex-1 sm:flex-initial">
                {applyLabel}
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

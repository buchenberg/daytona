/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn, pluralize } from '@/lib/utils'
import { CommandIcon, XIcon } from 'lucide-react'
import { motion } from 'motion/react'

export function SelectionToastContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'md:absolute md:-translate-x-1/2 md:left-1/2 fixed w-screen pointer-events-none flex left-0 justify-center items-center *:pointer-events-auto bottom-[120px] sm:bottom-20 z-50',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SelectionToast({
  className,
  selectedCount,
  onClearSelection,
  onActionClick,
}: {
  className?: string
  selectedCount: number
  onActionClick: () => void
  onClearSelection: () => void
}) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 20 }}
      className={cn('bg-popover rounded-xl gap-3', className)}
    >
      <div className="bg-background text-foreground border border-border rounded-xl shadow-lg pl-3 pr-1 py-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <div className="text-sm tabular-nums whitespace-nowrap">
            {pluralize(selectedCount, 'item', 'items')} selected
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClearSelection} className="p-1 size-7">
            <XIcon className="size-3.5" />
          </Button>
        </div>
        <Separator orientation="vertical" className="h-5" />

        <Button variant="ghost" size="sm" className="h-8" onClick={onActionClick}>
          <CommandIcon className="size-3.5" />
          <span className="text-sm">Actions</span>
        </Button>
      </div>
    </motion.div>
  )
}

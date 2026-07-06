/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

'use client'

import { Dialog as DrawerPrimitive } from '@base-ui/react/dialog'
import * as React from 'react'

import { cancelDismissOnToastPress } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type DrawerDirection = 'top' | 'bottom' | 'left' | 'right'

function Drawer({ onOpenChange, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root
      onOpenChange={(open, eventDetails) => {
        cancelDismissOnToastPress(open, eventDetails)
        if (!eventDetails.isCanceled) {
          onOpenChange?.(open, eventDetails)
        }
      }}
      {...props}
    />
  )
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal {...props} />
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Backdrop>) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:duration-200 data-closed:fill-mode-forwards fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  direction = 'bottom',
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Popup> & { direction?: DrawerDirection }) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Popup
        data-slot="drawer-content"
        data-drawer-direction={direction}
        className={cn(
          'group/drawer-content bg-background fixed z-50 flex h-auto flex-col',
          'data-open:animate-in data-closed:animate-out data-open:duration-300 data-closed:duration-200 ease-out',
          {
            'inset-x-0 top-0 mb-24 max-h-[80vh] rounded-b-lg border-b data-open:slide-in-from-top data-closed:slide-out-to-top':
              direction === 'top',
            'inset-x-0 bottom-0 mt-24 max-h-[80vh] rounded-t-lg border-t data-open:slide-in-from-bottom data-closed:slide-out-to-bottom':
              direction === 'bottom',
            'inset-y-0 right-0 w-3/4 border-l sm:max-w-sm data-open:slide-in-from-right data-closed:slide-out-to-right':
              direction === 'right',
            'inset-y-0 left-0 w-3/4 border-r sm:max-w-sm data-open:slide-in-from-left data-closed:slide-out-to-left':
              direction === 'left',
          },
          className,
        )}
        {...props}
      >
        <div className="bg-muted mx-auto my-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Popup>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex flex-col gap-0.5 p-4 group-data-[drawer-direction=bottom]/drawer-content:text-center group-data-[drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left',
        className,
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
}

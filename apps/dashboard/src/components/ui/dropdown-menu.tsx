/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Menu as DropdownMenuPrimitive } from '@base-ui/react/menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

const DropdownMenu = DropdownMenuPrimitive.Root

function DropdownMenuTrigger({ ref, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger ref={ref} {...props} />
}

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.SubmenuRoot

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

function DropdownMenuSubTrigger({
  ref,
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubmenuTrigger
      ref={ref}
      className={cn(
        'flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-popup-open:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        { 'pl-8': inset },
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </DropdownMenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  ref,
  className,
  sideOffset = 0,
  alignOffset = -4,
  collisionAvoidance = { side: 'shift', align: 'shift' },
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof DropdownMenuPrimitive.Positioner>,
    'sideOffset' | 'alignOffset' | 'collisionAvoidance'
  >) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner
        data-slot="dropdown-menu-sub-positioner"
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        // shift (rather than flip-only) so on narrow viewports the submenu
        // slides back into view and overlays the parent menu instead of
        // rendering off screen
        collisionAvoidance={collisionAvoidance}
        className="z-50"
      >
        <DropdownMenuPrimitive.Popup
          ref={ref}
          className={cn(
            'min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuContent({
  ref,
  className,
  side,
  align,
  sideOffset = 4,
  alignOffset,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof DropdownMenuPrimitive.Positioner>,
    'side' | 'align' | 'sideOffset' | 'alignOffset'
  >) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner
        data-slot="dropdown-menu-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50"
      >
        <DropdownMenuPrimitive.Popup
          ref={ref}
          onKeyDown={onKeyDown}
          className={cn(
            'min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  ref,
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      data-variant={variant}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-75',
        'data-[variant=destructive]:text-destructive-foreground data-[variant=destructive]:data-highlighted:bg-destructive-background dark:data-[variant=destructive]:data-highlighted:bg-destructive-background data-[variant=destructive]:data-highlighted:text-destructive-foreground data-[variant=destructive]:*:[svg]:text-destructive-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground',
        { 'pl-8': inset },
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  ref,
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.CheckboxItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioItem({
  ref,
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.RadioItemIndicator>
          <Circle className="h-2 w-2 fill-current" />
        </DropdownMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  ref,
  className,
  inset,
  ...props
}: React.ComponentProps<'div'> & {
  inset?: boolean
}) {
  return (
    <div
      ref={ref}
      data-slot="dropdown-menu-label"
      className={cn('px-2 py-1.5 text-sm font-semibold', { 'pl-8': inset }, className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  ref,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
}

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return <span className={cn('ml-auto text-xs tracking-widest opacity-60', className)} {...props} />
}
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
}

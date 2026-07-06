/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Base UI resolves the selected label from an `items` prop on the root instead of
 * reading the selected item's text like Radix did. To keep the Radix ergonomics
 * (no `items` prop needed at call sites), we collect `value -> label` from the
 * `SelectItem` elements found in `children` and expose them via context so
 * `SelectValue` can render the selected item's label.
 */
const SelectItemLabelsContext = React.createContext<Map<unknown, React.ReactNode> | null>(null)

function collectItemLabels(children: React.ReactNode, map: Map<unknown, React.ReactNode>) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return
    }

    const props = child.props as { value?: unknown; children?: React.ReactNode }

    if (child.type === SelectItem) {
      map.set(props.value, props.children)
      return
    }

    if (props.children) {
      collectItemLabels(props.children, map)
    }
  })
}

type SelectRootOnValueChange<Value, Multiple extends boolean | undefined> = NonNullable<
  SelectPrimitive.Root.Props<Value, Multiple>['onValueChange']
>

type SelectProps<Value, Multiple extends boolean | undefined = false> = Omit<
  SelectPrimitive.Root.Props<Value, Multiple>,
  'onValueChange'
> & {
  /**
   * Base UI emits `null` when a select is cleared, but none of our selects are
   * clearable, so the callback keeps the Radix-style non-null signature.
   */
  onValueChange?: (
    value: NonNullable<Parameters<SelectRootOnValueChange<Value, Multiple>>[0]>,
    eventDetails: Parameters<SelectRootOnValueChange<Value, Multiple>>[1],
  ) => void
}

function Select<Value, Multiple extends boolean | undefined = false>({
  children,
  onValueChange,
  ...props
}: SelectProps<Value, Multiple>) {
  const itemLabels = React.useMemo(() => {
    const map = new Map<unknown, React.ReactNode>()
    collectItemLabels(children, map)
    return map
  }, [children])

  return (
    <SelectItemLabelsContext.Provider value={itemLabels}>
      <SelectPrimitive.Root
        onValueChange={onValueChange as SelectPrimitive.Root.Props<Value, Multiple>['onValueChange']}
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectItemLabelsContext.Provider>
  )
}

const SelectGroup = SelectPrimitive.Group

function SelectValue({
  className,
  placeholder,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value> & { placeholder?: React.ReactNode }) {
  const itemLabels = React.useContext(SelectItemLabelsContext)

  return (
    <SelectPrimitive.Value data-slot="select-value" className={cn('truncate', className)} {...props}>
      {(value: unknown) => {
        if (value === null || value === undefined || value === '') {
          return placeholder ?? null
        }
        if (typeof children === 'function') {
          return children(value)
        }
        if (children !== null && children !== undefined) {
          return children
        }
        return itemLabels?.get(value) ?? String(value)
      }}
    </SelectPrimitive.Value>
  )
}

function SelectTrigger({
  ref,
  className,
  children,
  loading,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  loading?: boolean
  size?: 'xs' | 'sm' | 'default'
}) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-size={size}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-border bg-transparent dark:bg-input/50 px-3 py-2 text-sm ring-offset-background data-[placeholder]:text-muted-foreground disabled:opacity-50 [&>span]:line-clamp-1 data-[size=sm]:h-8 data-[size=xs]:h-7 outline-hidden',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'data-[slot=button]:!rounded-md',
        {
          'disabled:cursor-progress': loading,
          'disabled:cursor-not-allowed': !loading,
        },
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDown className="h-4 w-4 opacity-50" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectScrollUpButton({
  ref,
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  ref,
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownArrow>
  )
}

function SelectContent({
  ref,
  className,
  children,
  position = 'popper',
  side,
  align,
  sideOffset = 4,
  alignOffset,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> & {
  /** Kept for Radix API compatibility: 'popper' renders a regular dropdown, 'item-aligned' aligns the selected item over the trigger. */
  position?: 'popper' | 'item-aligned'
} & Pick<React.ComponentProps<typeof SelectPrimitive.Positioner>, 'side' | 'align' | 'sideOffset' | 'alignOffset'>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        alignItemWithTrigger={position === 'item-aligned'}
        className="z-50"
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Popup
          ref={ref}
          className={cn(
            'relative max-h-[min(24rem,var(--available-height))] w-full min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
        <SelectScrollDownButton />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ ref, className, ...props }: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      ref={ref}
      className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
      {...props}
    />
  )
}

function SelectItem({ ref, className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>

      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ ref, className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

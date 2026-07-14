import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { ChevronRight } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

function isCaretAtStart(element: HTMLElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    try {
      // selectionStart is null for input types without selection support
      return (element.selectionStart ?? 0) === 0 && (element.selectionEnd ?? 0) === 0
    } catch {
      return element.value === ''
    }
  }
  return false
}

// tracks the open panel so opening one closes its siblings
const DropdownMenuPanelGroupContext = React.createContext<{
  openPanelId: string | null
  setOpenPanelId: (id: string | null) => void
} | null>(null)

function DropdownMenuPanelGroup({ children }: { children: React.ReactNode }) {
  const [openPanelId, setOpenPanelId] = React.useState<string | null>(null)
  const contextValue = React.useMemo(() => ({ openPanelId, setOpenPanelId }), [openPanelId])

  return (
    <DropdownMenuPanelGroupContext.Provider value={contextValue}>{children}</DropdownMenuPanelGroupContext.Provider>
  )
}

const DropdownMenuPanelContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

function DropdownMenuPanel({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const panelId = React.useId()
  const group = React.useContext(DropdownMenuPanelGroupContext)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setUncontrolledOpen(nextOpen)
      if (nextOpen) {
        group?.setOpenPanelId(panelId)
      }
    },
    [group, panelId],
  )

  const closedBySibling = group != null && group.openPanelId !== null && group.openPanelId !== panelId
  React.useEffect(() => {
    if (open && closedBySibling) {
      setUncontrolledOpen(false)
    }
  }, [open, closedBySibling])

  const contextValue = React.useMemo(
    () => ({
      open,
      setOpen,
    }),
    [open, setOpen],
  )

  return (
    <DropdownMenuPanelContext.Provider value={contextValue}>
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          setOpen(nextOpen)
          onOpenChange?.(nextOpen, eventDetails)
        }}
        modal="trap-focus"
        {...props}
      />
    </DropdownMenuPanelContext.Provider>
  )
}

function DropdownMenuPanelTrigger({
  ref,
  className,
  inset,
  children,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger> & {
  inset?: boolean
}) {
  const panel = React.useContext(DropdownMenuPanelContext)

  return (
    <PopoverPrimitive.Trigger
      ref={ref}
      nativeButton={false}
      openOnHover
      delay={100}
      render={
        <MenuPrimitive.Item
          closeOnClick={false}
          className={cn(
            'flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-popup-open:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
            { 'pl-8': inset },
            className,
          )}
        />
      }
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          panel?.setOpen(true)
        }
      }}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </PopoverPrimitive.Trigger>
  )
}

function DropdownMenuPanelContent({
  ref,
  className,
  sideOffset = 0,
  alignOffset = -4,
  collisionAvoidance = { side: 'shift', align: 'shift' },
  onKeyDown,
  initialFocus,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> &
  Pick<React.ComponentProps<typeof PopoverPrimitive.Positioner>, 'sideOffset' | 'alignOffset' | 'collisionAvoidance'>) {
  const panel = React.useContext(DropdownMenuPanelContext)

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        data-slot="dropdown-menu-panel-positioner"
        side="inline-end"
        align="start"
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        // shift so narrow viewports overlay the parent menu instead of going off screen
        collisionAvoidance={collisionAvoidance}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          ref={ref}
          data-slot="dropdown-menu-panel-content"
          initialFocus={initialFocus}
          onKeyDown={(event) => {
            onKeyDown?.(event)

            // ArrowLeft backs out to the parent menu (in text fields: only at caret start)
            if (event.key === 'ArrowLeft') {
              const target = event.target as HTMLElement | null
              const textEntry = target?.closest<HTMLElement>('input, textarea, [contenteditable="true"]')
              if (!textEntry || isCaretAtStart(textEntry)) {
                panel?.setOpen(false)
              }
            }

            // keep keydowns from React-bubbling into the parent menu's typeahead
            event.stopPropagation()
          }}
          className={cn(
            'min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { DropdownMenuPanel, DropdownMenuPanelContent, DropdownMenuPanelGroup, DropdownMenuPanelTrigger }

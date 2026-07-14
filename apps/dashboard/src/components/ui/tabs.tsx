'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import * as React from 'react'

import { cn } from '@/lib/utils'

type TabsVariant = 'default' | 'underline'

const TabsVariantContext = React.createContext<TabsVariant>('default')

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />
}

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(
          {
            'inline-flex items-center bg-transparent border-b border-border rounded-none h-auto p-0 gap-0 justify-start shrink-0 text-muted-foreground':
              variant === 'underline',
            'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground':
              variant !== 'underline',
          },
          className,
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        {
          'inline-flex items-center justify-center whitespace-nowrap rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-active:border-foreground data-active:bg-transparent data-active:text-foreground data-active:shadow-none':
            variant === 'underline',
          'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-active:bg-card data-active:text-foreground data-active:shadow':
            variant !== 'underline',
        },
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('flex-1 outline-hidden', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }

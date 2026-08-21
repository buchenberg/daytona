import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const labelVariants = cva('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70')

function Label({
  ref,
  className,
  onMouseDown,
  ...props
}: React.ComponentProps<'label'> & VariantProps<typeof labelVariants>) {
  return (
    <label
      ref={ref}
      data-slot="label"
      className={cn(labelVariants(), className)}
      onMouseDown={(event) => {
        // prevent text selection when double clicking label
        if (!event.defaultPrevented && event.detail > 1) {
          event.preventDefault()
        }
        onMouseDown?.(event)
      }}
      {...props}
    />
  )
}

export { Label }

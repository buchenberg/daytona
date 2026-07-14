import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Separator({
  ref,
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      ref={ref}
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        {
          'h-[1px] w-full': orientation === 'horizontal',
          'h-full w-[1px]': orientation !== 'horizontal',
        },
        className,
      )}
      {...props}
    />
  )
}

export { Separator }

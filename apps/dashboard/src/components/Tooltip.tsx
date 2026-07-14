import { TooltipContent, TooltipTrigger, Tooltip as UiTooltip } from '@/components/ui/tooltip'
import React from 'react'

export function Tooltip({
  label,
  content,
  side = 'top',
  contentClassName,
}: {
  label: React.ReactElement<Record<string, unknown>>
  content: React.ReactNode
  side?: 'right' | 'left' | 'top' | 'bottom'
  contentClassName?: string
}) {
  return (
    <UiTooltip>
      <TooltipTrigger render={label} />
      <TooltipContent side={side} className={contentClassName}>
        {content}
      </TooltipContent>
    </UiTooltip>
  )
}

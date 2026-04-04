/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect, type FC } from 'react'

const VERBS = [
  'Pondering',
  'Brewing',
  'Cogitating',
  'Noodling',
  'Vibing',
  'Cooking',
  'Conjuring',
  'Manifesting',
  'Percolating',
  'Simmering',
  'Jabbubbleating',
  'Pepsiing',
  'Combobulating',
  'Wizarding',
  'Clauding',
  'Ruminating',
  'Marinating',
  'Concocting',
  'Hatching',
  'Unfurling',
]

function randomVerb(exclude?: string): string {
  const filtered = exclude ? VERBS.filter((v) => v !== exclude) : VERBS
  return filtered[Math.floor(Math.random() * filtered.length)]
}

export const ThinkingIndicator: FC = () => {
  const [verb, setVerb] = useState(() => randomVerb())
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setVerb((prev) => randomVerb(prev))
        setVisible(true)
      }, 300)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent flex-shrink-0" />
      <span
        className={`transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}
      >
        {verb}...
      </span>
    </div>
  )
}

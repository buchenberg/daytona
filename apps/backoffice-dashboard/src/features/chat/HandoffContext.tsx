/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, type FC } from 'react'
import { ChevronRight, ChevronDown, FileText } from 'lucide-react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'

interface HandoffContextProps {
  content: string
}

const remarkPlugins = [remarkGfm]

export const HandoffContext: FC<HandoffContextProps> = ({ content }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FileText className="h-3.5 w-3.5" />
        Conversation handoff context
      </button>
      {expanded && (
        <div className="border-t border-amber-500/20 px-3 py-2 prose prose-sm dark:prose-invert max-w-none overflow-x-auto">
          <MarkdownTextPrimitive remarkPlugins={remarkPlugins} preprocess={() => content} />
        </div>
      )}
    </div>
  )
}

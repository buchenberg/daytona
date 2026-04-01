/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
  QueueItemPrimitive,
  useMessagePartText,
} from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'
import { SyntaxHighlighter } from './syntax-highlighter'
import { ToolCallDisplay } from '../../features/chat/ToolUI'
import { ChartRenderer, parseChartFromMarkdown } from '../../features/chat/ChartRenderer'
import { WelcomeScreen } from '../../features/chat/WelcomeScreen'
import { useUser } from '../../providers/ApiProvider'
import { ArrowUp, Square, Copy, Check, RotateCw, Pencil, X } from 'lucide-react'
import { useState, type FC } from 'react'

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <ThreadPrimitive.Empty>
            <WelcomeScreen />
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
              UserEditComposer,
            }}
          />
        </div>
      </ThreadPrimitive.Viewport>

      <div className="max-w-5xl mx-auto w-full px-4 pb-4">
        <QueueIndicator />
        <Composer />
      </div>
    </ThreadPrimitive.Root>
  )
}

const QueueIndicator: FC = () => {
  return (
    <ComposerPrimitive.Queue>
      {() => (
        <div className="mb-2 px-2 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <QueueItemPrimitive.Text />
          <span className="ml-auto">queued</span>
        </div>
      )}
    </ComposerPrimitive.Queue>
  )
}

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm">
      <ComposerPrimitive.Input
        placeholder="Message Mali..."
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground min-h-[36px] max-h-[200px]"
        submitOnEnter
      />
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground h-8 w-8 shrink-0 disabled:opacity-50">
          <ArrowUp className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel className="inline-flex items-center justify-center rounded-lg bg-destructive text-destructive-foreground h-8 w-8 shrink-0">
          <Square className="h-3 w-3" />
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  )
}

const UserMessage: FC = () => {
  const user = useUser()
  return (
    <MessagePrimitive.Root className="flex justify-end mb-4 gap-2">
      <div className="max-w-[80%]">
        <div className="text-xs text-muted-foreground text-right mb-1">{user?.name || 'You'}</div>
        <div className="rounded-2xl bg-primary/70 text-primary-foreground px-4 py-2.5 text-sm select-text">
          <MessagePrimitive.Parts
            components={{
              Text: UserTextPart,
            }}
          />
        </div>
        <UserActionBar />
      </div>
    </MessagePrimitive.Root>
  )
}

const UserActionBar: FC = () => (
  <ActionBarPrimitive.Root className="mt-1 flex justify-end gap-1" hideWhenRunning>
    <CopyButton />
    <ActionBarPrimitive.Edit className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      <Pencil className="h-3 w-3" />
    </ActionBarPrimitive.Edit>
  </ActionBarPrimitive.Root>
)

// Rendered by ThreadPrimitive.Messages when a user message enters edit mode
const UserEditComposer: FC = () => (
  <div className="flex justify-end mb-4">
    <div className="max-w-[80%] w-full">
      <ComposerPrimitive.Root className="flex flex-col gap-2 rounded-xl border bg-background p-2">
        <ComposerPrimitive.Input className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none min-h-[36px] max-h-[200px] text-foreground" />
        <div className="flex gap-1 justify-end">
          <ComposerPrimitive.Cancel className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-3 w-3" /> Cancel
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-xs bg-primary text-primary-foreground">
            <Check className="h-3 w-3" /> Save & Resubmit
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  </div>
)

const UserTextPart: FC = () => {
  const part = useMessagePartText()
  return <p className="whitespace-pre-wrap">{part.text}</p>
}

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="flex mb-4 gap-2">
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
        <span className="text-xs font-bold text-primary">M</span>
      </div>
      <div className="max-w-[80%]">
        <div className="text-xs text-muted-foreground mb-1">Mali</div>
        <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm select-text">
          {/* assistant-ui dispatches each content part by type:
              - "text" parts → AssistantTextPart (markdown rendering + chart detection)
              - "tool-call" parts → ToolCallPart via tools.Fallback (colored dot + name)
              Parts render in the order they appear in the content array, so tool badges
              show inline where Claude called them, not grouped at the bottom. */}
          <MessagePrimitive.Parts
            components={{
              Text: AssistantTextPart,
              tools: { Fallback: ToolCallPart },
            }}
          />
        </div>
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  )
}

const markdownComponents = { SyntaxHighlighter }

// remark-gfm enables GitHub Flavored Markdown: pipe tables, strikethrough, autolinks.
// Without it, "| col | col |" renders as raw text — react-markdown only handles
// standard CommonMark by default.
const remarkPlugins = [remarkGfm]

// Rendering pipeline for assistant text parts:
//   1. parseChartFromMarkdown() checks for <!--chart:type--> markers
//   2. If found: splits text into before/chart/after, renders chart via recharts
//   3. If partial marker (streaming): hides the raw JSON, shows spinner
//   4. Otherwise: passes through to MarkdownTextPrimitive (react-markdown + remark-gfm → HTML)
// Recursive: after rendering a chart, the remaining text is re-parsed for more charts.
const RichMarkdown: FC<{ text: string }> = ({ text }) => {
  const parsed = parseChartFromMarkdown(text)

  if (parsed.chart) {
    return (
      <>
        {parsed.before && (
          <MarkdownTextPrimitive
            remarkPlugins={remarkPlugins}
            components={markdownComponents}
            preprocess={() => parsed.before}
          />
        )}
        <ChartRenderer type={parsed.chart.type} data={parsed.chart.data} />
        {parsed.after && <RichMarkdown text={parsed.after} />}
      </>
    )
  }

  if (parsed.streaming) {
    return (
      <>
        {parsed.before && (
          <MarkdownTextPrimitive
            remarkPlugins={remarkPlugins}
            components={markdownComponents}
            preprocess={() => parsed.before}
          />
        )}
        <div className="my-2 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Rendering chart...
        </div>
      </>
    )
  }

  return <MarkdownTextPrimitive remarkPlugins={remarkPlugins} components={markdownComponents} preprocess={() => text} />
}

const AssistantTextPart: FC = () => {
  const part = useMessagePartText()

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto">
      <RichMarkdown text={part.text} />
    </div>
  )
}

const ToolCallPart: FC<{
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
  argsText: string
  result?: unknown
  isError?: boolean
}> = (props) => {
  return <ToolCallDisplay toolName={props.toolName} args={props.args} result={props.result} isError={props.isError} />
}

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root className="mt-1 flex gap-1" hideWhenRunning>
      <CopyButton />
      <ActionBarPrimitive.Reload className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <RotateCw className="h-3 w-3" />
        <span>Continue</span>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  )
}

const CopyButton: FC = () => {
  const [copied, setCopied] = useState(false)
  return (
    <ActionBarPrimitive.Copy
      className="inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      onClick={() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </ActionBarPrimitive.Copy>
  )
}

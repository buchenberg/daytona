/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  QueueItemPrimitive,
  useMessagePartText,
  useThread,
} from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'
import { SyntaxHighlighter } from './syntax-highlighter'
import { ToolCallDisplay } from '../../features/chat/ToolUI'
import { ChartRenderer, parseChartFromMarkdown } from '../../features/chat/ChartRenderer'
import { WelcomeScreen } from '../../features/chat/WelcomeScreen'
import { ThinkingIndicator } from '../../features/chat/ThinkingIndicator'
import { HandoffContext } from '../../features/chat/HandoffContext'
import { CompactDialog } from '../../features/chat/CompactDialog'
import { useUser } from '../../providers/ApiProvider'
import {
  ArrowUp,
  ArrowDown,
  Square,
  Copy,
  Check,
  RotateCw,
  Pencil,
  X,
  Download,
  Bookmark,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { rememberFromConversation, compactConversation } from '../../features/chat/api'
import { getCurrentConversationId } from '../../features/chat/conversation-state'
import { useState, useEffect, useRef, createContext, useContext, type FC } from 'react'

export const Thread: FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [compactOpen, setCompactOpen] = useState(false)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
      setShowScrollBtn(!atBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToBottom = () => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' })
  }

  const compactCallbackRef = useRef<(() => void) | null>(null)

  const handleCompactConfirm = () => {
    setCompactOpen(false)
    compactCallbackRef.current?.()
  }

  return (
    <ThreadPrimitive.Root className="flex flex-col h-full relative">
      <CompactDialog open={compactOpen} onClose={() => setCompactOpen(false)} onConfirm={handleCompactConfirm} />
      <ThreadPrimitive.Viewport ref={viewportRef} className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 min-h-[calc(100%-80px)]">
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

          <SuggestionChips />
        </div>

        {/* Scroll-to-bottom: outside composer flow, uses opacity transition (no layout shift) */}
        <div
          className={`sticky bottom-20 z-10 flex justify-center pointer-events-none transition-opacity duration-200 ${showScrollBtn ? 'opacity-100' : 'opacity-0'}`}
        >
          <button
            onClick={scrollToBottom}
            className="rounded-full bg-background border shadow-md p-2 hover:bg-muted transition-colors pointer-events-auto"
            tabIndex={showScrollBtn ? 0 : -1}
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>

        <div className="max-w-5xl mx-auto w-full px-4 pb-4 sticky bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent">
          <QueueIndicator />
          <Composer
            onCompact={() => setCompactOpen(true)}
            registerCompactCallback={(cb) => {
              compactCallbackRef.current = cb
            }}
          />
        </div>
      </ThreadPrimitive.Viewport>
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

const toolBtnClass =
  'inline-flex items-center justify-center rounded-md h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40'

const Composer: FC<{ onCompact: () => void; registerCompactCallback: (cb: () => void) => void }> = ({
  onCompact,
  registerCompactCallback,
}) => {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isRunning = useThread((t) => t.isRunning)
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showStatus = (msg: string, isBusy: boolean) => {
    if (dismissRef.current) clearTimeout(dismissRef.current)
    setBusy(isBusy)
    setStatus(msg)
    if (!isBusy) {
      dismissRef.current = setTimeout(() => setStatus(null), 10000)
    }
  }

  const clearStatus = () => {
    if (dismissRef.current) clearTimeout(dismissRef.current)
    setStatus(null)
    setBusy(false)
  }

  const handleRemember = async () => {
    const id = getCurrentConversationId()
    if (!id || busy) return
    showStatus('Saving to memory...', true)
    try {
      const result = await rememberFromConversation(id)
      showStatus(result.success ? `Saved: ${result.key}` : 'No useful insight found', false)
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`, false)
    }
  }

  const handleCompact = async () => {
    const id = getCurrentConversationId()
    if (!id || busy) return
    showStatus('Compacting conversation...', true)
    try {
      await compactConversation(id)
      showStatus('Conversation compacted', false)
    } catch (err) {
      showStatus(`Failed to compact: ${err instanceof Error ? err.message : 'Unknown error'}`, false)
    }
  }

  useEffect(() => {
    registerCompactCallback(handleCompact)
  })

  return (
    <div>
      {status && (
        <div className="mb-1.5 px-2.5 py-1 rounded-md border text-xs flex items-center gap-2 bg-muted/50 text-muted-foreground">
          {busy ? (
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
          )}
          <span className="flex-1">{status}</span>
          {!busy && (
            <button onClick={clearStatus} className="hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm">
        <button onClick={onCompact} disabled={busy || isRunning} className={toolBtnClass} title="Compact conversation">
          <Minimize2 className="h-4 w-4" />
        </button>
        <button onClick={handleRemember} disabled={busy || isRunning} className={toolBtnClass} title="Save to memory">
          <Bookmark className="h-4 w-4" />
        </button>
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
    </div>
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
  <ActionBarPrimitive.Root className="mt-1 flex justify-end items-center gap-1" hideWhenRunning>
    <BranchPicker />
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

// ThreadPrimitive.Suggestions returns null when empty, so no wrapper div needed
const SuggestionChips: FC = () => (
  <ThreadPrimitive.Suggestions>
    {({ suggestion }) => (
      <ThreadPrimitive.Suggestion
        prompt={suggestion.prompt}
        autoSend
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer mr-2 mb-2 mt-2"
      >
        {suggestion.prompt}
      </ThreadPrimitive.Suggestion>
    )}
  </ThreadPrimitive.Suggestions>
)

const UserTextPart: FC = () => {
  const part = useMessagePartText()
  return <p className="whitespace-pre-wrap">{part.text}</p>
}

// Context scoped to each AssistantMessage — parts report their activity state
// so the thinking indicator shows whenever Claude is running but not actively
// streaming text or executing a tool call.
const MessageActivityContext = createContext<{
  setTextStreaming: (v: boolean) => void
  setToolRunning: (v: boolean) => void
}>({
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setTextStreaming: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setToolRunning: () => {},
})

const AssistantMessage: FC = () => {
  const [textStreaming, setTextStreaming] = useState(false)
  const [toolRunning, setToolRunning] = useState(false)
  const isRunning = useThread((t) => t.isRunning)

  const showThinking = isRunning && !textStreaming && !toolRunning

  return (
    <MessageActivityContext.Provider value={{ setTextStreaming, setToolRunning }}>
      <MessagePrimitive.Root className="flex mb-4 gap-2">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-xs font-bold text-primary">M</span>
        </div>
        <div className="max-w-[80%]">
          <div className="text-xs text-muted-foreground mb-1">Mali</div>
          <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm select-text">
            <MessagePrimitive.Parts
              components={{
                Text: AssistantTextPart,
                tools: { Fallback: ToolCallPart },
              }}
            />
            {showThinking && <ThinkingIndicator />}
          </div>
          <AssistantActionBar />
        </div>
      </MessagePrimitive.Root>
    </MessageActivityContext.Provider>
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
const HANDOFF_MARKER = '<!--mali:handoff-->'

const RichMarkdown: FC<{ text: string }> = ({ text }) => {
  if (text.trimStart().startsWith(HANDOFF_MARKER)) {
    const content = text.trimStart().slice(HANDOFF_MARKER.length).trim()
    return <HandoffContext content={content} />
  }

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
  const { setTextStreaming } = useContext(MessageActivityContext)
  const streamingRef = useRef(false)

  useEffect(() => {
    const shouldStream = !!part.text
    if (shouldStream !== streamingRef.current) {
      streamingRef.current = shouldStream
      setTextStreaming(shouldStream)
    }
  }, [part.text, setTextStreaming])

  useEffect(() => {
    return () => {
      streamingRef.current = false
      setTextStreaming(false)
    }
  }, [setTextStreaming])

  if (!part.text) return null

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
  const { setToolRunning } = useContext(MessageActivityContext)
  const runningRef = useRef(false)
  const isToolRunning = props.result === undefined

  useEffect(() => {
    if (isToolRunning !== runningRef.current) {
      runningRef.current = isToolRunning
      setToolRunning(isToolRunning)
    }
  }, [isToolRunning, setToolRunning])

  useEffect(() => {
    return () => {
      runningRef.current = false
      setToolRunning(false)
    }
  }, [setToolRunning])

  return <ToolCallDisplay toolName={props.toolName} args={props.args} result={props.result} isError={props.isError} />
}

const actionBtnClass =
  'inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'

const BranchPicker: FC = () => (
  <BranchPickerPrimitive.Root
    hideWhenSingleBranch
    className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
  >
    <BranchPickerPrimitive.Previous className={actionBtnClass}>
      <ChevronLeft className="h-3 w-3" />
    </BranchPickerPrimitive.Previous>
    <span className="tabular-nums">
      <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
    </span>
    <BranchPickerPrimitive.Next className={actionBtnClass}>
      <ChevronRight className="h-3 w-3" />
    </BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
)

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root className="mt-1 flex items-center gap-1" hideWhenRunning>
      <BranchPicker />
      <CopyButton />
      <ActionBarPrimitive.ExportMarkdown className={actionBtnClass}>
        <Download className="h-3.5 w-3.5" />
      </ActionBarPrimitive.ExportMarkdown>
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

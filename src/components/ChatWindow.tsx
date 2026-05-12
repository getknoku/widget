/**
 * Side-panel chat surface: greeting + suggested questions, scrolling message
 * list, composer with optional image attachment. Owns the input state; chat
 * state itself lives in the `useChat` hook.
 */

import { useState, useRef, useEffect } from 'preact/hooks'
import type { WidgetConfig } from '../types'
import type { UIStrings } from '../i18n'
import { useChat } from '../hooks/useChat'
import { Message } from './Message'
import { resolveIcon } from '../icons'

interface Props {
  config: WidgetConfig
  t: UIStrings
  initialQuestion: string
  onClose: () => void
  onQuestionSent: () => void
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB cap, matches backend.

export function ChatWindow({ config, t, initialQuestion, onClose, onQuestionSent }: Props) {
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { messages, isLoading, sessionId, sendMessage, regenerate } = useChat(config)

  // Auto-submit a question handed in via Knoku.ask() — see widget.tsx handleAsk.
  useEffect(() => {
    if (!initialQuestion) return
    sendMessage(initialQuestion)
    onQuestionSent()
  }, [initialQuestion, onQuestionSent, sendMessage])

  // Stick to the bottom of the message list as new content streams in.
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages])

  const handleFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert(t.imageOnlyPNG)
      return
    }
    if (file.size > MAX_SIZE) {
      alert(t.imageTooLarge)
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    const q = input.trim()
    if (q.length < 5 || isLoading) return
    const img = imagePreview || undefined
    setInput('')
    setImageFile(null)
    setImagePreview(null)
    sendMessage(q, 0, img)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div class="knoku-panel">
      <div class="knoku-header">
        <div class="knoku-header-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <span>{t.assistant}</span>
        </div>
        <div class="knoku-header-actions">
          {config.mcpEnabled && config.mcpUrl && (
            <McpButton mcpUrl={config.mcpUrl} />
          )}
          <button class="knoku-header-btn" onClick={onClose} title={t.close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="knoku-messages" ref={messagesRef}>
        {messages.length === 0 && !isLoading && config.greeting && (
          <div class="knoku-greeting">
            {config.greeting}
          </div>
        )}
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
          const canRegen = isLastAssistant && (msg.regenerateCount || 0) < 1 && !msg.isStreaming
          return (
            <Message
              key={i}
              message={msg}
              t={t}
              apiUrl={config.apiUrl}
              projectId={config.projectId}
              primaryDomain={config.primaryDomain}
              sessionId={sessionId}
              messageIndex={i}
              isLastAssistant={isLastAssistant}
              onRegenerate={regenerate}
              canRegenerate={canRegen}
            />
          )
        })}
      </div>

      {messages.length === 0 && !isLoading && config.suggestedQuestions?.length > 0 && (
        <div class="knoku-suggestions">
          {config.suggestedQuestions.map((q) => (
            <button
              key={q.text}
              class="knoku-suggestion-chip"
              onClick={() => sendMessage(q.text)}
            >
              <svg
                class="knoku-suggestion-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                dangerouslySetInnerHTML={{ __html: resolveIcon(q.icon) }}
              />
              <span>{q.text}</span>
            </button>
          ))}
        </div>
      )}

      {messages.length === 0 && !isLoading && (
        <div class="knoku-disclaimer">{t.aiDisclaimer}</div>
      )}

      <form
        class="knoku-input-area"
        onSubmit={handleSubmit}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div class={`knoku-input-box ${dragOver ? 'knoku-drag-over' : ''}`}>
          {imagePreview && (
            <div class="knoku-img-preview">
              <img src={imagePreview} alt="attachment" />
              <button type="button" class="knoku-img-remove" onClick={() => { setImagePreview(null); setImageFile(null) }}>✕</button>
            </div>
          )}
          <textarea
            ref={inputRef}
            class="knoku-textarea"
            placeholder={t.askPlaceholder}
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
            disabled={isLoading}
            rows={1}
          />
          <div class="knoku-input-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleFile(file)
              }}
            />
            <button type="button" class="knoku-attach-btn" onClick={() => fileRef.current?.click()} title={t.attach}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <button
              class="knoku-send-btn"
              type="submit"
              disabled={isLoading || input.trim().length < 5}
              style={{ backgroundColor: 'var(--knoku-primary-accent)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
        </div>
        {config.brandingRequired && (
          <div class="knoku-branding">
            <span>Powered by</span>
            <a href="https://knoku.com" target="_blank" rel="noopener noreferrer">Knoku</a>
          </div>
        )}
      </form>
    </div>
  )
}

// --- MCP popover ---
//
// Surfaces the "Use MCP" entry point only when the project has it enabled.
// The button stays in the chat header so it shows up next to the close
// button without crowding the message area. Popover is positioned absolutely
// inside the panel; closing on outside-click is handled with a transparent
// backdrop layer that captures the next pointer event.

interface McpButtonProps {
  mcpUrl: string
}

function McpButton({ mcpUrl }: McpButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const slug = (() => {
    try {
      const host = new URL(mcpUrl).hostname
      return host.split('.')[0]
    } catch {
      return 'docs'
    }
  })()
  const serverName = `knoku-${slug}`

  const cursorConfig = btoa(JSON.stringify({ url: mcpUrl }))
  const cursorHref = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(serverName)}&config=${encodeURIComponent(cursorConfig)}`
  const vscodeHref = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: serverName, url: mcpUrl }))}`
  const claudeCommand = `claude mcp add --transport http ${serverName} ${mcpUrl}`

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 1500)
    } catch {
      // Some browsers block clipboard inside an iframe / non-secure context.
      // Fail silently — the user can manually copy from the visible URL.
    }
  }

  return (
    <div class="knoku-mcp-wrap">
      <button
        class="knoku-mcp-trigger"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Use MCP">
        <span>Use MCP</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style={open ? 'transform: rotate(180deg)' : ''}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <>
          <div class="knoku-mcp-backdrop" onClick={() => setOpen(false)} />
          <div class="knoku-mcp-popover" role="dialog" aria-label="Connect to AI tools">
            <div class="knoku-mcp-head">
              <p class="knoku-mcp-title">Connect to AI Tools</p>
              <p class="knoku-mcp-sub">Access this documentation via MCP</p>
            </div>
            <a class="knoku-mcp-row" href={cursorHref} target="_blank" rel="noopener noreferrer">
              <span class="knoku-mcp-row-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2"/>
                  <polyline points="3 7 12 12 21 7"/>
                  <line x1="12" y1="12" x2="12" y2="22"/>
                </svg>
              </span>
              <span class="knoku-mcp-row-body">
                <span class="knoku-mcp-row-title">Add to Cursor</span>
                <span class="knoku-mcp-row-meta">One-click install</span>
              </span>
              <ExternalIcon />
            </a>
            <a class="knoku-mcp-row" href={vscodeHref} target="_blank" rel="noopener noreferrer">
              <span class="knoku-mcp-row-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>
              </span>
              <span class="knoku-mcp-row-body">
                <span class="knoku-mcp-row-title">Add to VS Code</span>
                <span class="knoku-mcp-row-meta">One-click install</span>
              </span>
              <ExternalIcon />
            </a>
            <button
              class="knoku-mcp-row knoku-mcp-row-btn"
              type="button"
              onClick={() => copy(claudeCommand, 'claude')}>
              <span class="knoku-mcp-row-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 17 10 11 4 5"/>
                  <line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
              </span>
              <span class="knoku-mcp-row-body">
                <span class="knoku-mcp-row-title">Add to Claude Code</span>
                <span class="knoku-mcp-row-meta">{copied === 'claude' ? 'Command copied' : 'Copy CLI command'}</span>
              </span>
            </button>
            <button
              class="knoku-mcp-row knoku-mcp-row-btn"
              type="button"
              onClick={() => copy(mcpUrl, 'url')}>
              <span class="knoku-mcp-row-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </span>
              <span class="knoku-mcp-row-body">
                <span class="knoku-mcp-row-title">Copy MCP URL</span>
                <span class="knoku-mcp-row-meta">{copied === 'url' ? 'URL copied' : 'For Claude Desktop, ChatGPT, etc.'}</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ExternalIcon() {
  return (
    <svg class="knoku-mcp-row-external" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

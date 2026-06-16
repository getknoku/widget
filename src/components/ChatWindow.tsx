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
import { reportDeflectorOutcome } from '../deflector-outcome'

interface Props {
  config: WidgetConfig
  t: UIStrings
  initialQuestion: string
  onClose: () => void
  onQuestionSent: () => void
  panelWide?: boolean
  onToggleWide?: () => void
  isDeflector?: boolean
  onDeflectorResolved?: () => void
  onDeflectorContinue?: () => void
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB cap, matches backend.

export function ChatWindow({ config, t, initialQuestion, onClose, onQuestionSent, panelWide, onToggleWide, isDeflector, onDeflectorResolved, onDeflectorContinue }: Props) {
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const stickToBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const lastScrollHeightRef = useRef(0)
  const initialQuestionSentRef = useRef<string | null>(null)
  const { messages, isLoading, sessionId, sendMessage, regenerate } = useChat(config)

  const isModal = config.layout === 'modal'
  const isEmpty = messages.length === 0 && !isLoading
  const exampleLabel = t.exampleQuestions || 'Example questions'
  const hasCompleteAnswer = messages.some((m) => {
    if (m.role !== 'assistant' || m.isStreaming) return false
    if (m.content.trim().length > 0) return true
    return (m.timeline || []).some(
      (item) => item.kind === 'text' && item.text.trim().length > 0,
    )
  })
  const showDeflectorActions = Boolean(isDeflector && hasCompleteAnswer && !isLoading)
  const headerTitle = isDeflector ? (t.deflectorTitle || t.assistant) : t.assistant

  useEffect(() => {
    if (!initialQuestion) {
      initialQuestionSentRef.current = null
      return
    }
    if (initialQuestionSentRef.current === initialQuestion) return
    initialQuestionSentRef.current = initialQuestion
    sendMessage(initialQuestion)
    onQuestionSent()
  }, [initialQuestion, onQuestionSent, sendMessage])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = dist < 50
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!stickToBottomRef.current) return
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = messagesRef.current
      if (!el || !stickToBottomRef.current) return
      const nextHeight = el.scrollHeight
      if (nextHeight === lastScrollHeightRef.current) return
      lastScrollHeightRef.current = nextHeight
      el.scrollTop = nextHeight
    })
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

  const panelClass = [
    'knoku-panel',
    isModal ? 'knoku-panel-modal' : '',
    !isEmpty ? 'knoku-panel-in-chat' : '',
  ].filter(Boolean).join(' ')

  const messagesClass = [
    'knoku-messages',
    isEmpty && !isModal ? 'knoku-messages-empty' : '',
  ].filter(Boolean).join(' ')

  const modalExamples = isModal && isEmpty && config.suggestedQuestions.length > 0 ? (
    <div class="knoku-modal-examples">
      <p class="knoku-modal-examples-label">{exampleLabel}</p>
      <div class="knoku-modal-example-list">
        {config.suggestedQuestions.map((q) => (
          <button
            key={q.text}
            type="button"
            class="knoku-modal-example"
            onClick={() => sendMessage(q.text)}
          >
            <svg
              class="knoku-modal-example-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: resolveIcon(q.icon) }}
            />
            <span class="knoku-modal-example-text">{q.text}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null

  return (
    <div class={panelClass}>
      <div class="knoku-header">
        <div class="knoku-header-left">
          <span>{headerTitle}</span>
        </div>
        <div class="knoku-header-actions">
          {config.mcpEnabled && config.mcpUrl && (
            <McpButton mcpUrl={config.mcpUrl} />
          )}
          {onToggleWide && (
            <button class="knoku-header-btn" onClick={onToggleWide} title={panelWide ? (t.collapse || 'Collapse') : (t.expand || 'Expand')}>
              {panelWide ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 14 10 14 10 20"/>
                  <polyline points="20 10 14 10 14 4"/>
                  <line x1="14" y1="10" x2="21" y2="3"/>
                  <line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 3 21 3 21 9"/>
                  <polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/>
                  <line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              )}
            </button>
          )}
          {!isDeflector && (
            <button class="knoku-header-btn" onClick={onClose} title={t.close} aria-label={t.close}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {isModal && isEmpty && !isDeflector ? (
        <div class="knoku-modal-body">
          {config.greeting && (
            <div class="knoku-modal-intro">
              <span class="knoku-modal-intro-icon" aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  dangerouslySetInnerHTML={{ __html: resolveIcon(config.launcherIcon || 'book-open') }}
                />
              </span>
              <p class="knoku-modal-intro-text">{config.greeting}</p>
            </div>
          )}
          {modalExamples}
        </div>
      ) : (
        <div class={messagesClass} ref={messagesRef}>
          {!isModal && isEmpty && config.greeting && (
            <div class="knoku-greeting">{config.greeting}</div>
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
                turnstileSiteKey={config.turnstileSiteKey}
                sessionId={sessionId}
                messageIndex={i}
                isLastAssistant={isLastAssistant}
                onRegenerate={regenerate}
                canRegenerate={canRegen}
              />
            )
          })}
        </div>
      )}

      {!isModal && isEmpty && config.suggestedQuestions?.length > 0 && (
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

      {!isModal && isEmpty && (
        <div class="knoku-disclaimer">{t.aiDisclaimer}</div>
      )}

      {showDeflectorActions && (
        <div class="knoku-deflector-actions">
          <button
            type="button"
            class="knoku-deflector-btn knoku-deflector-btn-primary"
            onClick={() => {
              reportDeflectorOutcome(config, sessionId, 'resolved')
              onDeflectorResolved?.()
            }}
          >
            {t.deflectorResolved || 'This answered my question'}
          </button>
          <button
            type="button"
            class="knoku-deflector-btn knoku-deflector-btn-secondary"
            onClick={() => {
              reportDeflectorOutcome(config, sessionId, 'continued')
              onDeflectorContinue?.()
            }}
          >
            {t.deflectorContinue || 'Continue to support'}
          </button>
        </div>
      )}

      {(isDeflector || !showDeflectorActions) && (
      <form
        class={`knoku-input-area${isModal ? ' knoku-input-area-modal' : ''}${isDeflector ? ' knoku-input-area-deflector' : ''}`}
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
            enterkeyhint="send"
            autocomplete="off"
            autocorrect="off"
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onFocus={() => {
              if (!stickToBottomRef.current) return
              requestAnimationFrame(() => {
                const el = messagesRef.current
                if (el && stickToBottomRef.current) {
                  lastScrollHeightRef.current = el.scrollHeight
                  el.scrollTop = el.scrollHeight
                }
              })
            }}
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
        {config.brandingRequired ? (
          <div class="knoku-branding">
            <span>Powered by</span>
            <a href="https://knoku.com" target="_blank" rel="noopener noreferrer">Knoku</a>
          </div>
        ) : null}
      </form>
      )}
    </div>
  )
}

// --- MCP popover ---

interface McpButtonProps {
  mcpUrl: string
}

function McpButton({ mcpUrl }: McpButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const serverName = (() => {
    try {
      return new URL(mcpUrl).hostname.split('.')[0]
    } catch {
      return 'knoku-docs'
    }
  })()

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
      // Clipboard may be blocked inside iframes.
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

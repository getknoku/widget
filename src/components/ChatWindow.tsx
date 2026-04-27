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
    if (!q || isLoading) return
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">
            <path d="M12 2.75l2.45 6.8L21.25 12l-6.8 2.45L12 21.25l-2.45-6.8L2.75 12l6.8-2.45L12 2.75z"/>
            <path d="M5.25 3.75l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z"/>
          </svg>
          <span>{t.assistant}</span>
        </div>
        <div class="knoku-header-actions">
          <button class="knoku-header-btn" onClick={onClose} title={t.close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="knoku-messages" ref={messagesRef}>
        {messages.length === 0 && !isLoading && (
          <div class="knoku-greeting">
            {config.greeting}
            {config.suggestedQuestions?.length > 0 && (
              <div class="knoku-suggestions">
                {config.suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    class="knoku-suggestion-chip"
                    onClick={() => sendMessage(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div class="knoku-disclaimer">{t.aiDisclaimer}</div>
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
              sessionId={sessionId}
              messageIndex={i}
              isLastAssistant={isLastAssistant}
              onRegenerate={regenerate}
              canRegenerate={canRegen}
            />
          )
        })}
      </div>

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
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
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
              disabled={isLoading || !input.trim()}
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

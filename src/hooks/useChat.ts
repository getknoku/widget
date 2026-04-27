/**
 * Single stateful hook driving the chat panel.
 *
 * Owns the message list, the current `session_id`, and the SSE streaming
 * loop. `sendMessage` POSTs to `/api/v1/chat`, parses the SSE wire format
 * (`text` / `thinking` / `tool_*` / `sources` / `done` / `error`) and
 * incrementally updates the last assistant message. `regenerate` re-runs
 * the most recent user turn (limited to one regeneration per turn).
 *
 * `sessionIdRef` mirrors the `sessionId` state so async closures inside
 * the SSE reader read the current value rather than a stale snapshot
 * captured at hook-creation time.
 */

import { useState, useCallback, useRef } from 'preact/hooks'
import type { Message, SelectedDocument, SSEEvent, SourceRef, StatusStep, WidgetConfig } from '../types'
import { getOrCreateWebID } from '../cookie'
import { getIdentity } from '../identity'

export function useChat(config: WidgetConfig) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const updateLast = (updater: (msg: Message) => Message) => {
    setMessages(prev => {
      const msgs = [...prev]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = updater({ ...last })
      }
      return msgs
    })
  }

  // Send a question to the backend and stream the answer. `regenCount > 0`
  // marks the request as a regeneration so the backend can skip rate
  // limiting / counting against the user's quota.
  const sendMessage = useCallback(async (question: string, regenCount: number = 0, imageBase64?: string) => {
    const userMsg: Message = { role: 'user', content: question, image: imageBase64 }
    const assistantMsg: Message = { role: 'assistant', content: '', steps: [], isStreaming: true, regenerateCount: regenCount }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsLoading(true)

    window.dispatchEvent(new CustomEvent('knoku:message', { detail: { question } }))

    const controller = new AbortController()
    abortRef.current = controller

    let text = ''
    let sources: SourceRef[] = []
    let steps: StatusStep[] = []
    let readCount = 0
    let thinkingText = ''

    try {
      const identity = getIdentity()
      const body: any = {
        project_id: config.projectId,
        question,
        session_id: sessionIdRef.current,
        regenerate: regenCount > 0,
        user: {
          web_id: getOrCreateWebID(),
          ...(identity?.id ? { id: identity.id } : {}),
          ...(identity?.email ? { email: identity.email } : {}),
          ...(identity?.metadata ? { metadata: identity.metadata } : {}),
        },
      }
      if (imageBase64) {
        body.image = imageBase64
      }

      const response = await fetch(`${config.apiUrl}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        throw new Error(errorBody?.error || `HTTP ${response.status}`)
      }
      if (!response.body) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data) continue

          let event: SSEEvent
          try { event = JSON.parse(data) } catch { continue }

          switch (event.type) {
            case 'tool_start':
              if (event.tool_name === 'search_documents') {
                steps = [...steps, { icon: 'search', text: 'Searching documentation...' }]
                updateLast(m => ({ ...m, steps: [...steps] }))
              }
              break

            case 'tool_result':
              if (event.tool_name === 'search_documents' && event.text) {
                const documents = parseSelectedDocuments(event.text)
                const count = documents.length || countSearchResults(event.text)
                if (count > 0 && steps.length > 0 && steps[steps.length - 1].icon === 'search') {
                  steps[steps.length - 1] = {
                    icon: 'search',
                    text: `Found ${count} relevant document${count > 1 ? 's' : ''}`,
                    documents,
                  }
                  updateLast(m => ({ ...m, steps: [...steps] }))
                }
              }
              if (event.tool_name === 'get_page_content') {
                readCount++
                const readStep = steps.find(s => s.icon === 'read')
                if (readStep) {
                  readStep.text = `Read ${readCount} section${readCount > 1 ? 's' : ''}`
                  updateLast(m => ({ ...m, steps: [...steps] }))
                } else {
                  steps = [...steps, { icon: 'read', text: `Read ${readCount} section` }]
                  updateLast(m => ({ ...m, steps: [...steps] }))
                }
              }
              break

            case 'thinking':
              thinkingText = (thinkingText || '') + (event.text || '')
              updateLast(m => ({ ...m, thinking: thinkingText, isStreaming: true }))
              break

            case 'text':
              text += event.text || ''
              updateLast(m => ({ ...m, content: text }))
              break

            case 'sources':
              sources = event.sources || []
              updateLast(m => ({ ...m, sources }))
              break

            case 'error':
              updateLast(m => ({ ...m, content: `Error: ${event.text}`, isStreaming: false }))
              setIsLoading(false)
              return

            case 'done':
              if (event.session_id) {
                sessionIdRef.current = event.session_id
                setSessionId(event.session_id)
              }
              updateLast(m => {
                const update: Message = { ...m, isStreaming: false }
                if (m.thinking && m.thinkingDuration === undefined) {
                  update.thinkingDuration = 0
                }
                return update
              })
              setIsLoading(false)
              window.dispatchEvent(new CustomEvent('knoku:response', { detail: { answer: text, sources } }))
              return
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateLast(m => ({ ...m, content: `Connection error: ${err.message}`, isStreaming: false }))
      }
      setIsLoading(false)
    }
  }, [config])

  // Re-run the last user turn. Capped at a single regeneration per turn so
  // hosts can't spin the chat infinitely; the cap mirrors the assistant
  // message's `regenerateCount`.
  const regenerate = useCallback(() => {
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx === -1 || isLoading) return
    const lastAssistant = messages[lastUserIdx + 1]
    if (lastAssistant && (lastAssistant.regenerateCount || 0) >= 1) return
    const question = messages[lastUserIdx].content
    const count = (lastAssistant?.regenerateCount || 0) + 1
    setMessages(prev => prev.slice(0, lastUserIdx))
    setTimeout(() => sendMessage(question, count), 50)
  }, [messages, isLoading, sendMessage])

  return { messages, isLoading, sessionId, sendMessage, regenerate }
}

/**
 * Best-effort count of documents returned by `search_documents`. Falls back
 * to counting `doc_id` occurrences when the payload isn't valid JSON, so a
 * partial stream still produces a reasonable status string.
 */
function countSearchResults(payload: string): number {
  try {
    const parsed = JSON.parse(payload)
    if (Array.isArray(parsed)) return parsed.length
    if (Array.isArray(parsed?.documents)) return parsed.documents.length
    if (typeof parsed?.selected === 'number') return parsed.selected
    return 0
  } catch {
    return payload.match(/"doc_id"/g)?.length || 0
  }
}

/**
 * Extract document metadata from a `search_documents` tool result for the
 * expandable status step. Tolerant of missing fields — anything that lacks
 * both `path` and `title` is dropped.
 */
function parseSelectedDocuments(payload: string): SelectedDocument[] {
  try {
    const parsed = JSON.parse(payload)
    const rawDocs = Array.isArray(parsed) ? parsed : parsed?.documents
    if (!Array.isArray(rawDocs)) return []
    return rawDocs
      .map((doc: any) => ({
        doc_id: typeof doc?.doc_id === 'string' ? doc.doc_id : '',
        path: typeof doc?.path === 'string' ? doc.path : '',
        title: typeof doc?.title === 'string' ? doc.title : '',
      }))
      .filter((doc: SelectedDocument) => doc.path || doc.title)
  } catch {
    return []
  }
}

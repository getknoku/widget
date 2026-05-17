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
import type { Message, SelectedDocument, SSEEvent, SourceRef, StatusStep, TimelineItem, WidgetConfig } from '../types'
import { getOrCreateWebID } from '../cookie'
import { getIdentity } from '../identity'
import { getDictionary } from '../i18n'

// Pull the search query out of a tool_args payload like
// `{"query":"X","top_k":5}`. Returns '' for malformed / non-string queries
// so callers can fall back to a generic "Searching..." label.
function extractSearchQuery(toolArgs?: string): string {
  if (!toolArgs) return ''
  try {
    const args = JSON.parse(toolArgs)
    if (args && typeof args.query === 'string') return args.query.trim()
  } catch {
    /* partial / non-JSON — fall through */
  }
  return ''
}

// Pull the model-written narration sentence out of a search_documents
// tool_args payload. Narration is what the driver wrote in the user's
// language to describe what it's looking up — used as the search-step
// chip label. Older backend builds may not include it; callers should
// fall back to a generic "Searching..." string.
function extractSearchNarration(toolArgs?: string): string {
  if (!toolArgs) return ''
  try {
    const args = JSON.parse(toolArgs)
    if (args && typeof args.narration === 'string') return args.narration.trim()
  } catch {
    /* partial / non-JSON — fall through */
  }
  return ''
}

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
    const assistantMsg: Message = { role: 'assistant', content: '', steps: [], timeline: [], isStreaming: true, regenerateCount: regenCount }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsLoading(true)

    const strings = getDictionary(config.language)

    window.dispatchEvent(new CustomEvent('knoku:message', { detail: { question } }))

    const controller = new AbortController()
    abortRef.current = controller

    let text = ''
    let sources: SourceRef[] = []
    // Legacy collections kept populated so existing chrome (regenerate/copy,
    // older rendering paths) keeps working — the new timeline below is the
    // canonical display.
    let steps: StatusStep[] = []
    let readCount = 0
    let thinkingText = ''
    let lastSearchQuery = ''

    // Chronological timeline of items rendered in the assistant bubble.
    // - text items accumulate model narration / final answer chunks
    // - search-start / search-done are added separately per tool call so
    //   the user sees "Searching: 'X'" stay on screen and "Found N
    //   documents" appear as a new line beneath it.
    let timeline: TimelineItem[] = []

    // Smoothing layer for streamed answer text. Token-rate from the LLM is
    // bursty (≥100 tok/s on a hot provider, much slower under load);
    // splicing every chunk into the timeline produces a jerky dump-style
    // paint. SSE chunks go into `textBuffer` (a mutable closure ref); a
    // requestAnimationFrame loop drains a few chars per frame into the
    // displayed timeline. One setMessages call per frame max — aligned
    // with the browser paint cycle so we never queue work the user won't
    // see.
    let textBuffer = ''
    let smoothRafId: number | null = null
    let lastFrameTime = 0

    const appendDisplayed = (chunk: string) => {
      const last = timeline[timeline.length - 1]
      if (last && last.kind === 'text') {
        timeline = [
          ...timeline.slice(0, -1),
          { kind: 'text', text: last.text + chunk },
        ]
      } else {
        timeline = [...timeline, { kind: 'text', text: chunk }]
      }
      text += chunk
      updateLast(m => ({ ...m, content: text, timeline: [...timeline], composing: false }))
    }

    const cancelSmoothing = () => {
      if (smoothRafId !== null) {
        cancelAnimationFrame(smoothRafId)
        smoothRafId = null
      }
    }

    const drainSmoothing = () => {
      cancelSmoothing()
      if (textBuffer.length === 0) return
      const flush = textBuffer
      textBuffer = ''
      appendDisplayed(flush)
    }

    const scheduleSmoothTick = () => {
      if (smoothRafId !== null) return
      const tick = (frameTime: number) => {
        smoothRafId = null
        if (textBuffer.length === 0) return
        // Time-based pacing: how many chars to emit since the last frame.
        // Floor at ~200 cps so the user always sees a typewriter cadence
        // even when the model dumps a long answer in one chunk. Scale up
        // when the buffer is big so we don't fall multiple seconds behind
        // a fast model (≈4s worst-case drain), but never instant flush.
        const dt = lastFrameTime ? Math.min(frameTime - lastFrameTime, 64) : 16
        lastFrameTime = frameTime
        const cps = Math.max(200, textBuffer.length / 4)
        const charsThisTick = Math.max(1, Math.round(cps * (dt / 1000)))
        const chunk = textBuffer.slice(0, charsThisTick)
        textBuffer = textBuffer.slice(charsThisTick)
        appendDisplayed(chunk)
        if (textBuffer.length > 0) {
          smoothRafId = requestAnimationFrame(tick)
        }
      }
      lastFrameTime = 0
      smoothRafId = requestAnimationFrame(tick)
    }

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
              drainSmoothing()
              if (event.tool_name === 'search_documents') {
                const query = extractSearchQuery(event.tool_args)
                const narration = extractSearchNarration(event.tool_args)
                lastSearchQuery = query
                // Surface the model-written narration as its own prose
                // bubble BEFORE the search-step chip. Flash Lite skips
                // free-form preamble before tool calls, so we synthesize
                // the bubble from the required `narration` tool argument.
                // The chip below stays generic ("Searching..." → "Found
                // N") — the narration text is what tells the user WHAT
                // we're looking up.
                if (narration) {
                  timeline = [...timeline, { kind: 'text', text: narration }]
                }
                timeline = [...timeline, { kind: 'search', query, narration }]
                steps = [...steps, {
                  icon: 'search',
                  text: strings.searching,
                }]
                // Future text events open a new text item (don't continue
                // the synthesized narration one).
                text = ''
                updateLast(m => ({ ...m, timeline: [...timeline], steps: [...steps], content: '' }))
              } else if (event.tool_name === 'get_document_structure') {
                steps = [...steps, {
                  icon: 'read',
                  text: strings.examiningStructure || strings.searching,
                }]
                updateLast(m => ({ ...m, steps: [...steps] }))
              }
              break

            case 'tool_result':
              if (event.tool_name === 'search_documents' && event.text) {
                const documents = parseSelectedDocuments(event.text)
                const count = documents.length || countSearchResults(event.text)
                if (count > 0) {
                  // Fill in count + documents on the pending search row
                  // (last search item without a count). Same row gets
                  // the "Found N" suffix inline; no new row added.
                  for (let i = timeline.length - 1; i >= 0; i--) {
                    const it = timeline[i]
                    if (it.kind === 'search' && it.count === undefined) {
                      timeline = [
                        ...timeline.slice(0, i),
                        { kind: 'search', query: it.query, narration: it.narration, count, documents },
                        ...timeline.slice(i + 1),
                      ]
                      break
                    }
                  }
                  if (steps.length > 0 && steps[steps.length - 1].icon === 'search') {
                    steps[steps.length - 1] = {
                      icon: 'search',
                      text: strings.foundDocs(count),
                      documents,
                    }
                  }
                  updateLast(m => ({ ...m, timeline: [...timeline], steps: [...steps] }))
                  lastSearchQuery = ''
                }
              }
              if (event.tool_name === 'get_page_content') {
                readCount++
                const readStep = steps.find(s => s.icon === 'read' && !s.documents)
                if (readStep) {
                  readStep.text = strings.readSections(readCount)
                  updateLast(m => ({ ...m, steps: [...steps] }))
                } else {
                  steps = [...steps, { icon: 'read', text: strings.readSections(readCount) }]
                  updateLast(m => ({ ...m, steps: [...steps] }))
                }
              }
              break

            case 'thinking':
              thinkingText = (thinkingText || '') + (event.text || '')
              updateLast(m => ({ ...m, thinking: thinkingText, isStreaming: true }))
              break

            case 'text': {
              // Push raw chunk into the smoothing buffer; the tick drains
              // it into the timeline at a steady cadence. See textBuffer /
              // scheduleSmoothTick at the top of sendMessage for rationale.
              textBuffer += event.text || ''
              scheduleSmoothTick()
              break
            }

            case 'writer_start': {
              // Driver loop ended; writer is about to start streaming.
              // Flag the message so the renderer shows animated dots
              // while we wait for the first text chunk.
              updateLast(m => ({ ...m, composing: true }))
              break
            }

            case 'truncate_text': {
              // Server decided the most recent text block was the driver
              // model's final-iter hand-off / overshoot (e.g. composing
              // an answer it shouldn't have) and asks us to drop it. The
              // writer's real answer streams underneath next. Cancel any
              // in-flight smoothing so we don't paint chunks after the
              // truncation point.
              cancelSmoothing()
              textBuffer = ''
              for (let i = timeline.length - 1; i >= 0; i--) {
                if (timeline[i].kind === 'text') {
                  timeline = [
                    ...timeline.slice(0, i),
                    ...timeline.slice(i + 1),
                  ]
                  break
                }
              }
              text = timeline
                .filter((t): t is Extract<TimelineItem, { kind: 'text' }> => t.kind === 'text')
                .map(t => t.text)
                .join('\n')
              updateLast(m => ({ ...m, content: text, timeline: [...timeline] }))
              break
            }

            case 'text_replace': {
              // Server post-processed the writer's text (e.g. stripped a
              // trailing Sources block the API didn't suppress) and asks
              // us to replace whatever streamed in with the cleaned
              // version. Rewrite the last text item and the legacy
              // `content` mirror so copy / regenerate stay accurate.
              // Drain any pending smoothing buffer first so the cleaned
              // version isn't immediately appended-to.
              cancelSmoothing()
              textBuffer = ''
              const replacement = event.text || ''
              text = replacement
              let replaced = false
              for (let i = timeline.length - 1; i >= 0; i--) {
                if (timeline[i].kind === 'text') {
                  timeline = [
                    ...timeline.slice(0, i),
                    { kind: 'text', text: replacement },
                    ...timeline.slice(i + 1),
                  ]
                  replaced = true
                  break
                }
              }
              if (!replaced && replacement) {
                timeline = [...timeline, { kind: 'text', text: replacement }]
              }
              updateLast(m => ({ ...m, content: text, timeline: [...timeline] }))
              break
            }

            case 'sources':
              // The backend emits `sources` twice per turn once
              // KNOKU_EMIT_RETRIEVED_SOURCES is on — first with
              // source_role=retrieved (the full retrieval set, for
              // dashboard analytics), then source_role=cited (the
              // user-facing subset). Render only the cited payload so
              // the chip list does not flicker through the retrieved
              // superset. Older backend builds omit source_role; treat
              // the untagged event as cited (the prior single-emission
              // contract) so this widget keeps working unchanged.
              if (event.source_role && event.source_role !== 'cited') break
              sources = event.sources || []
              updateLast(m => ({ ...m, sources }))
              break

            case 'error':
              cancelSmoothing()
              textBuffer = ''
              updateLast(m => ({ ...m, content: `Error: ${event.text}`, isStreaming: false }))
              setIsLoading(false)
              return

            case 'done': {
              // Defer the "turn complete" UI signals (isStreaming=false,
              // knoku:response event, spinner clear) until the smoothing
              // buffer has finished typing out. Without this, the last
              // chunk of the answer dumps in one frame the moment the SSE
              // closes — defeating the whole point of the cadence.
              const finalize = () => {
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
              }
              const waitForDrain = () => {
                if (textBuffer.length === 0 && smoothRafId === null) {
                  finalize()
                } else {
                  setTimeout(waitForDrain, 40)
                }
              }
              waitForDrain()
              return
            }
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

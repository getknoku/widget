/**
 * Serialize / parse `data-suggested-questions` (comma-separated items,
 * optional `|icon` suffix per item).
 *
 * Commas and pipes inside question text are escaped as `\,` and `\|`.
 * Backslashes in text are escaped as `\\`. Unescaped commas still separate
 * items so existing embeds keep working.
 */

export interface SuggestedQuestionCsvItem {
  text: string
  icon?: string
}

const ESCAPE_IN_TEXT = new Set(['\\', ',', '|'])

export function escapeSuggestedQuestionText(text: string): string {
  let out = ''
  for (const ch of text) {
    if (ESCAPE_IN_TEXT.has(ch)) out += `\\${ch}`
    else out += ch
  }
  return out
}

export function unescapeSuggestedQuestionText(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      out += text[i + 1]
      i++
      continue
    }
    out += text[i]
  }
  return out
}

/** Split on commas that are not preceded by an odd number of backslashes. */
export function splitEscapedCsv(value: string): string[] {
  const items: string[] = []
  let current = ''
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) {
      current += value[i] + value[i + 1]
      i++
      continue
    }
    if (value[i] === ',') {
      items.push(current)
      current = ''
      continue
    }
    current += value[i]
  }
  items.push(current)
  return items
}

function isEscapedAt(value: string, index: number): boolean {
  let escapes = 0
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i--) escapes++
  return escapes % 2 === 1
}

/** Icon suffix is the last unescaped `|` in the segment. */
export function splitTextAndIcon(segment: string): SuggestedQuestionCsvItem {
  const trimmed = segment.trim()
  if (!trimmed) return { text: '' }

  let pipeIdx = -1
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] !== '|' || isEscapedAt(trimmed, i)) continue
    pipeIdx = i
    break
  }

  if (pipeIdx === -1) {
    return { text: unescapeSuggestedQuestionText(trimmed) }
  }

  const rawText = trimmed.slice(0, pipeIdx).trim()
  const icon = trimmed.slice(pipeIdx + 1).trim()
  const text = unescapeSuggestedQuestionText(rawText)
  if (!text) return { text: '' }
  return icon ? { text, icon } : { text }
}

export function formatSuggestedQuestionsCsv(questions: SuggestedQuestionCsvItem[]): string {
  return questions
    .map((q) => {
      const text = q.text.trim()
      if (!text) return ''
      const escaped = escapeSuggestedQuestionText(text)
      const icon = q.icon?.trim()
      return icon ? `${escaped}|${icon}` : escaped
    })
    .filter(Boolean)
    .join(',')
}

export function parseSuggestedQuestionsCsv(value: string): SuggestedQuestionCsvItem[] {
  const items: SuggestedQuestionCsvItem[] = []
  for (const raw of splitEscapedCsv(value)) {
    const parsed = splitTextAndIcon(raw)
    if (!parsed.text) continue
    items.push(parsed)
  }
  return items
}

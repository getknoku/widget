import { describe, expect, it } from 'vitest'
import {
  formatSuggestedQuestionsCsv,
  parseSuggestedQuestionsCsv,
} from './suggested-questions-format'

describe('suggested-questions-format', () => {
  it('keeps legacy comma-separated embeds unchanged', () => {
    const value = 'Get started|rocket,API reference|code,Pricing|card'
    expect(parseSuggestedQuestionsCsv(value)).toEqual([
      { text: 'Get started', icon: 'rocket' },
      { text: 'API reference', icon: 'code' },
      { text: 'Pricing', icon: 'card' },
    ])
  })

  it('parses a single question whose text contains commas', () => {
    const value = formatSuggestedQuestionsCsv([{ text: 'BUR,BİR,SORU', icon: 'book-open' }])
    expect(value).toBe('BUR\\,BİR\\,SORU|book-open')
    expect(parseSuggestedQuestionsCsv(value)).toEqual([
      { text: 'BUR,BİR,SORU', icon: 'book-open' },
    ])
  })

  it('round-trips multiple questions when one contains commas', () => {
    const input = [
      { text: 'How do I start?', icon: 'rocket' },
      { text: 'Bu bir, cümle nasıl?', icon: 'book-open' },
      { text: 'Pricing?' },
    ]
    expect(parseSuggestedQuestionsCsv(formatSuggestedQuestionsCsv(input))).toEqual(input)
  })

  it('supports pipes inside question text', () => {
    const input = [{ text: 'A|B|C', icon: 'code' }]
    const value = formatSuggestedQuestionsCsv(input)
    expect(value).toBe('A\\|B\\|C|code')
    expect(parseSuggestedQuestionsCsv(value)).toEqual(input)
  })

  it('supports backslashes in question text', () => {
    const input = [{ text: 'path\\to\\file' }]
    const value = formatSuggestedQuestionsCsv(input)
    expect(value).toBe('path\\\\to\\\\file')
    expect(parseSuggestedQuestionsCsv(value)).toEqual(input)
  })

  it('does not treat escaped commas as item separators', () => {
    expect(parseSuggestedQuestionsCsv('one\\,two,three')).toEqual([
      { text: 'one,two' },
      { text: 'three' },
    ])
  })
})

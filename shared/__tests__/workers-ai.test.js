import { describe, expect, it } from 'vitest'
import { extractAiContent, extractAiObject, extractAiText } from '../workers-ai.js'

describe('extractAiContent', () => {
  it('reads the native Workers AI shape', () => {
    expect(extractAiContent({ response: 'hello' })).toBe('hello')
  })

  it('reads the OpenAI-compatible chat completion shape', () => {
    const completion = {
      id: 'chatcmpl-1',
      choices: [{ message: { role: 'assistant', content: 'hello' } }]
    }
    expect(extractAiContent(completion)).toBe('hello')
  })

  it('prefers the chat completion shape when a model returns both', () => {
    const completion = {
      response: 'stale',
      choices: [{ message: { content: 'fresh' } }]
    }
    expect(extractAiContent(completion)).toBe('fresh')
  })

  it('preserves an already-parsed object from json_schema mode', () => {
    const recipe = { name: 'Soup' }
    expect(extractAiContent({ response: recipe })).toBe(recipe)
  })

  it('passes a bare string through', () => {
    expect(extractAiContent('hello')).toBe('hello')
  })

  it('accepts the loose aliases older call sites relied on', () => {
    expect(extractAiContent({ result: 'a' })).toBe('a')
    expect(extractAiContent({ text: 'b' })).toBe('b')
    expect(extractAiContent({ content: 'c' })).toBe('c')
  })

  it('returns null when there is no content', () => {
    expect(extractAiContent(null)).toBeNull()
    expect(extractAiContent(undefined)).toBeNull()
    expect(extractAiContent({})).toBeNull()
    expect(extractAiContent({ choices: [] })).toBeNull()
    expect(extractAiContent(42)).toBeNull()
  })
})

describe('extractAiText', () => {
  it('returns text unchanged', () => {
    expect(extractAiText({ choices: [{ message: { content: '{"a":1}' } }] })).toBe('{"a":1}')
  })

  it('stringifies structured content so JSON scanning still works', () => {
    expect(extractAiText({ response: { a: 1 } })).toBe('{"a":1}')
  })

  it('returns null when there is no content', () => {
    expect(extractAiText({})).toBeNull()
  })
})

describe('extractAiObject', () => {
  it('returns an already-parsed object as-is', () => {
    const recipe = { name: 'Soup' }
    expect(extractAiObject({ response: recipe })).toBe(recipe)
  })

  it('parses a JSON string returned through the chat completion shape', () => {
    const completion = { choices: [{ message: { content: '{"name":"Soup"}' } }] }
    expect(extractAiObject(completion)).toEqual({ name: 'Soup' })
  })

  it('returns null for unparseable text', () => {
    expect(extractAiObject({ response: 'not json' })).toBeNull()
  })

  it('returns null for JSON that is not an object', () => {
    expect(extractAiObject({ response: '42' })).toBeNull()
  })
})

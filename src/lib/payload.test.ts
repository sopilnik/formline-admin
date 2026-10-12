import { describe, expect, it } from 'vitest'
import { asRecord, count, text, UUID_PATTERN, whole } from '@/lib/payload'

describe('payload readers', () => {
  it('take an object, never an array or a plain value', () => {
    expect(asRecord({ name: 'Hush' })).toEqual({ name: 'Hush' })
    expect(asRecord(['Hush'])).toBeNull()
    expect(asRecord(null)).toBeNull()
    expect(asRecord('Hush')).toBeNull()
  })

  it('read a text only when it holds more than spaces, the same way for the log, the bell and the letters', () => {
    expect(text({ name: 'Hush' }, 'name')).toBe('Hush')
    expect(text({ name: '   ' }, 'name')).toBeNull()
    expect(text({ name: 7 }, 'name')).toBeNull()
    expect(text({}, 'name')).toBeNull()
  })

  it('read whole numbers, and counts from zero', () => {
    expect(whole({ n: -3 }, 'n')).toBe(-3)
    expect(whole({ n: 1.5 }, 'n')).toBeNull()
    expect(count({ n: 0 }, 'n')).toBe(0)
    expect(count({ n: -3 }, 'n')).toBeNull()
    expect(count({ n: '3' }, 'n')).toBeNull()
  })

  it('know a UUID as Postgres writes it', () => {
    expect(UUID_PATTERN.test('0f1e2d3c-4b5a-4968-8776-655443322110')).toBe(true)
    expect(UUID_PATTERN.test('0F1E2D3C-4B5A-4968-8776-655443322110')).toBe(false)
    expect(UUID_PATTERN.test('system')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { stableId } from './ids.ts'

describe('stableId', () => {
  it('derives the same well-formed id from the same key', () => {
    const id = stableId('product:loud')

    expect(id).toBe(stableId('product:loud'))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(stableId('product:hush')).not.toBe(id)
  })
})

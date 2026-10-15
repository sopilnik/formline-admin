import { describe, expect, it } from 'vitest'
import { createShortcutReader, SEQUENCE_MS, type KeyInput } from '@/lib/shortcuts'

const press = (key: string, time: number, extra: Partial<KeyInput> = {}): KeyInput =>
  ({ key, code: `Key${key.toUpperCase()}`, ctrlKey: false, metaKey: false, altKey: false, typing: false, time, ...extra })

describe('createShortcutReader', () => {
  it('goes to a page on "g" and its letter', () => {
    const read = createShortcutReader()

    expect(read(press('g', 0))).toBeNull()
    expect(read(press('o', 300))).toEqual({ type: 'go', page: 'orders' })
    expect(read(press('g', 1000))).toBeNull()
    expect(read(press('h', 1100))).toEqual({ type: 'go', page: 'overview' })
    read(press('g', 2000))
    expect(read(press('p', 2000 + SEQUENCE_MS))).toEqual({ type: 'go', page: 'products' })
    read(press('g', 5000))
    expect(read(press('c', 5010))).toEqual({ type: 'go', page: 'customers' })
  })

  it('forgets "g" after a second, or after any other key', () => {
    const read = createShortcutReader()

    read(press('g', 0))
    expect(read(press('o', SEQUENCE_MS + 1))).toBeNull()
    read(press('g', 5000))
    read(press('x', 5100))
    expect(read(press('o', 5200))).toBeNull()
    expect(read(press('o', 5300))).toBeNull()
  })

  it('reads "/" and "?"', () => {
    const read = createShortcutReader()

    expect(read(press('/', 0, { code: 'Slash' }))).toEqual({ type: 'search' })
    expect(read(press('?', 10, { code: 'Slash' }))).toEqual({ type: 'help' })
  })

  it('takes the letters by their place on a Cyrillic layout, and ignores capitals', () => {
    const read = createShortcutReader()

    read(press('п', 0, { code: 'KeyG' }))
    expect(read(press('щ', 100, { code: 'KeyO' }))).toEqual({ type: 'go', page: 'orders' })
    read(press('G', 1000, { code: 'KeyG' }))
    expect(read(press('o', 1100))).toBeNull()
  })

  it('stays out of fields and of keys held with a modifier', () => {
    const read = createShortcutReader()

    expect(read(press('/', 0, { typing: true }))).toBeNull()
    read(press('g', 100, { typing: true }))
    expect(read(press('o', 200))).toBeNull()
    read(press('g', 1000))
    expect(read(press('o', 1100, { ctrlKey: true }))).toBeNull()
    expect(read(press('?', 2000, { metaKey: true }))).toBeNull()
    expect(read(press('/', 3000, { altKey: true }))).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_OUTBOX_QUERY, outboxHref, parseOutboxQuery } from '@/lib/outbox/query'

describe('outbox query', () => {
  it('reads the page and its size, and falls back to the defaults', () => {
    expect(parseOutboxQuery({ page: '3', size: '50' })).toEqual({ page: 3, size: 50 })
    expect(parseOutboxQuery({ page: 'x', size: '7' })).toEqual(DEFAULT_OUTBOX_QUERY)
  })

  it('leaves the defaults out and starts again at page 1 when the size changes', () => {
    expect(outboxHref(DEFAULT_OUTBOX_QUERY)).toBe('/outbox')
    expect(outboxHref({ page: 3, size: 25 }, { page: 4 })).toBe('/outbox?page=4')
    expect(outboxHref({ page: 3, size: 25 }, { size: 100 })).toBe('/outbox?size=100')
  })
})

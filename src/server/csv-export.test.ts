import { describe, expect, it } from 'vitest'
import { csvResponse } from '@/server/csv-export'

const stream = () => new ReadableStream<Uint8Array>({ start: controller => controller.close() })

describe('csvResponse', () => {
  it('names the file after the list and the store\'s date, and never lets it be cached', () => {
    const response = csvResponse('orders', stream(), { ids: [], truncated: false }, 'Europe/Berlin', new Date('2026-09-30T22:30:00Z'))
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="orders-2026-10-01.csv"')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.has('x-export-truncated')).toBe(false)
  })

  it('says when the list was cut at the cap', () => {
    const response = csvResponse('customers', stream(), { ids: ['a'], truncated: true }, 'UTC', new Date('2026-09-30T22:30:00Z'))
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="customers-2026-09-30.csv"')
    expect(response.headers.get('x-export-truncated')).toBe('true')
  })
})

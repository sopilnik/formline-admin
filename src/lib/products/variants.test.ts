import { describe, expect, it } from 'vitest'
import { parseVariants } from '@/lib/products/variants'

const A = '0b2c6b5e-3c1f-4f7a-9a51-1d5b2c3e4f60'
const B = '7d9e1f20-8a3b-4c5d-9e6f-a1b2c3d4e5f6'

const form = (values: Record<string, string>) => (name: string) => values[name] ?? ''

describe('parseVariants', () => {
  it('reads every row, an empty price as no override', () => {
    const text = form({ [`price:${A}`]: '', [`stock:${A}`]: '12', [`stockWas:${A}`]: '10', [`threshold:${A}`]: '3', [`price:${B}`]: '55,5', [`stock:${B}`]: ' 0 ', [`stockWas:${B}`]: '0', [`threshold:${B}`]: '0' })

    expect(parseVariants([A, B, A], text)).toEqual({
      ok: true,
      rows: [
        { id: A, priceOverrideCents: null, stock: 12, stockWas: 10, lowStockThreshold: 3 },
        { id: B, priceOverrideCents: 5550, stock: 0, stockWas: 0, lowStockThreshold: 0 },
      ],
    })
  })

  it('names the problem of each field of each row', () => {
    const text = form({ [`price:${A}`]: '0', [`stock:${A}`]: '-1', [`stockWas:${A}`]: '4', [`threshold:${A}`]: '1001', [`stock:${B}`]: '2.5', [`stockWas:${B}`]: '2', [`threshold:${B}`]: '3' })

    expect(parseVariants([A, B], text)).toEqual({
      ok: false,
      errors: { [A]: { price: 'price_invalid', stock: 'stock_invalid', threshold: 'threshold_invalid' }, [B]: { stock: 'stock_invalid' } },
    })
  })

  it('keeps stock within 100,000', () => {
    const text = form({ [`stock:${A}`]: '100001', [`stockWas:${A}`]: '0', [`threshold:${A}`]: '3' })

    expect(parseVariants([A], text)).toEqual({ ok: false, errors: { [A]: { stock: 'stock_invalid' } } })
  })

  it('refuses a form without rows, with a malformed id or without the stock it was opened with', () => {
    expect(parseVariants([], form({}))).toBeNull()
    expect(parseVariants(['nope'], form({}))).toBeNull()
    expect(parseVariants([A], form({ [`stock:${A}`]: '1', [`threshold:${A}`]: '3' }))).toBeNull()
  })
})

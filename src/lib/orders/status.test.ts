import { describe, expect, it } from 'vitest'
import { canTransition, isOrderStatus, nextStatuses, ORDER_STATUSES, REVENUE_STATUSES, returnsStock, transitionsForAny } from '@/lib/orders/status'

describe('order status machine (spec §8.2)', () => {
  it('lists the six statuses and the four that count as revenue', () => {
    expect(ORDER_STATUSES).toEqual(['paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
    expect(REVENUE_STATUSES).toEqual(['paid', 'processing', 'shipped', 'delivered'])
    expect(isOrderStatus('shipped')).toBe(true)
    expect(isOrderStatus('lost')).toBe(false)
  })

  it('moves forward one step and allows cancelling before shipping and refunding after paying', () => {
    expect(nextStatuses('paid')).toEqual(['processing', 'cancelled', 'refunded'])
    expect(nextStatuses('processing')).toEqual(['shipped', 'cancelled', 'refunded'])
    expect(nextStatuses('shipped')).toEqual(['delivered', 'refunded'])
    expect(nextStatuses('delivered')).toEqual(['refunded'])
    expect(nextStatuses('cancelled')).toEqual([])
    expect(nextStatuses('refunded')).toEqual([])
    expect(canTransition('paid', 'shipped')).toBe(false)
    expect(canTransition('shipped', 'cancelled')).toBe(false)
    expect(canTransition('delivered', 'refunded')).toBe(true)
  })

  it('returns stock only when cancelling or refunding before shipping', () => {
    expect(returnsStock('paid', 'cancelled')).toBe(true)
    expect(returnsStock('processing', 'refunded')).toBe(true)
    expect(returnsStock('shipped', 'refunded')).toBe(false)
    expect(returnsStock('paid', 'processing')).toBe(false)
  })

  it('offers the transitions valid for at least one of the selected statuses, in status order', () => {
    expect(transitionsForAny(['shipped', 'paid'])).toEqual(['processing', 'delivered', 'cancelled', 'refunded'])
    expect(transitionsForAny(['cancelled'])).toEqual([])
    expect(transitionsForAny([])).toEqual([])
  })
})

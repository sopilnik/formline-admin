import { describe, expect, it } from 'vitest'
import { navItems } from '@/components/app/nav'

const ALL = ['overview', 'orders', 'products', 'collections', 'customers', 'team', 'activity', 'outbox', 'settings']

describe('navItems', () => {
  it('shows owners and admins every module', () => {
    for (const role of ['owner', 'admin'] as const) expect(navItems(role, 'sandbox').map(i => i.key)).toEqual(ALL)
  })

  it('leaves the activity log and the outbox out for managers and viewers', () => {
    for (const role of ['manager', 'viewer'] as const) {
      expect(navItems(role, 'sandbox').map(i => i.key)).toEqual(ALL.filter(k => k !== 'activity' && k !== 'outbox'))
    }
  })

  it('puts the store modules before the administration', () => {
    expect(navItems('owner', 'owner').map(i => i.group)).toEqual(['store', 'store', 'store', 'store', 'store', 'admin', 'admin', 'admin', 'admin'])
  })

  it('carries a count only where there is one', () => {
    const items = navItems('manager', 'sandbox', { orders: 18 })
    expect(items.find(item => item.key === 'orders')?.count).toBe(18)
    expect(items.filter(item => item.count !== undefined).map(item => item.key)).toEqual(['orders'])
    expect(navItems('owner', 'owner', { orders: 0 }).find(item => item.key === 'orders')).not.toHaveProperty('count')
  })
})

import { describe, expect, it } from 'vitest'
import { can, type Action } from '@/server/authz/matrix'
import { authorize, ForbiddenError } from '@/server/authz/authorize'

const ALL = ['owner', 'admin', 'manager', 'viewer'] as const
const rows: [Action, (typeof ALL)[number][], 'sandbox' | 'owner'][] = [
  ['data.read', ['owner', 'admin', 'manager', 'viewer'], 'sandbox'],
  ['csv.export', ['owner', 'admin', 'manager', 'viewer'], 'sandbox'],
  ['orders.update', ['owner', 'admin', 'manager'], 'sandbox'],
  ['catalog.write', ['owner', 'admin', 'manager'], 'sandbox'],
  ['catalog.delete', ['owner', 'admin', 'manager'], 'sandbox'],
  ['customers.notes', ['owner', 'admin', 'manager'], 'sandbox'],
  ['activity.read', ['owner', 'admin'], 'sandbox'],
  ['outbox.read', ['owner', 'admin'], 'sandbox'],
  ['team.manage', ['owner', 'admin'], 'sandbox'],
  ['settings.store', ['owner', 'admin'], 'sandbox'],
  ['stripe.import', ['owner'], 'owner'],
  ['self.manage', ['owner', 'admin', 'manager', 'viewer'], 'sandbox'],
  ['sandbox.tools', ['owner', 'admin', 'manager', 'viewer'], 'sandbox'],
]

describe('can', () => {
  it.each(rows)('%s is allowed for exactly %j', (action, allowed, kind) => {
    for (const role of ALL) expect([action, role, can(role, action, kind)]).toEqual([action, role, allowed.includes(role)])
  })

  it('keeps the team and the sandbox tools out of the owner workspace', () => {
    expect(can('owner', 'team.manage', 'owner')).toBe(false)
    expect(can('owner', 'sandbox.tools', 'owner')).toBe(false)
  })

  it('keeps the Stripe import out of sandboxes', () => {
    expect(can('owner', 'stripe.import', 'sandbox')).toBe(false)
  })

  it('allows nothing in the template workspace', () => {
    expect(can('owner', 'data.read', 'template')).toBe(false)
  })
})

describe('authorize', () => {
  it('throws ForbiddenError naming the action', () => {
    expect(() => authorize({ role: 'viewer', workspaceKind: 'sandbox' }, 'orders.update')).toThrow(ForbiddenError)
    try { authorize({ role: 'viewer', workspaceKind: 'sandbox' }, 'orders.update') } catch (e) { expect((e as ForbiddenError).action).toBe('orders.update') }
  })

  it('returns quietly when allowed', () => {
    expect(authorize({ role: 'manager', workspaceKind: 'sandbox' }, 'orders.update')).toBeUndefined()
  })
})

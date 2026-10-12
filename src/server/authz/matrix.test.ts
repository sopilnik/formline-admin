import { describe, expect, it } from 'vitest'
import { can, type Action } from '@/server/authz/matrix'
import { authorize, ForbiddenError } from '@/server/authz/authorize'

const ROLES = ['owner', 'admin', 'manager', 'viewer'] as const
const KINDS = ['sandbox', 'owner', 'template'] as const
type Allowed = Partial<Record<(typeof KINDS)[number], readonly (typeof ROLES)[number][]>>

const EVERYONE = ROLES
const EDITORS = ['owner', 'admin', 'manager'] as const
const LEADS = ['owner', 'admin'] as const

/** Who may do what in each kind of workspace (spec §5.5), written out in full: a kind left out allows no one. */
const expected: Record<Action, Allowed> = {
  'data.read': { sandbox: EVERYONE, owner: EVERYONE },
  'csv.export': { sandbox: EVERYONE, owner: EVERYONE },
  'orders.update': { sandbox: EDITORS, owner: EDITORS },
  'catalog.write': { sandbox: EDITORS, owner: EDITORS },
  'catalog.delete': { sandbox: EDITORS, owner: EDITORS },
  'customers.notes': { sandbox: EDITORS, owner: EDITORS },
  'activity.read': { sandbox: LEADS, owner: LEADS },
  'outbox.read': { sandbox: LEADS, owner: LEADS },
  'team.read': { sandbox: LEADS, owner: LEADS },
  'team.manage': { sandbox: LEADS },
  'settings.store': { sandbox: LEADS, owner: LEADS },
  'stripe.import': { owner: ['owner'] },
  'self.manage': { sandbox: EVERYONE, owner: EVERYONE },
  'sandbox.tools': { sandbox: EVERYONE },
}

describe('can', () => {
  it.each(Object.entries(expected) as [Action, Allowed][])('%s allows exactly the listed roles in every kind of workspace', (action, allowed) => {
    const actual = Object.fromEntries(KINDS.map(kind => [kind, ROLES.filter(role => can(role, action, kind))]))

    expect(actual).toEqual(Object.fromEntries(KINDS.map(kind => [kind, [...(allowed[kind] ?? [])]])))
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

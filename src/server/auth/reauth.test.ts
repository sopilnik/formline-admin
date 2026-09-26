import { describe, expect, it } from 'vitest'
import { isRecentAuth } from '@/server/auth/reauth'

const now = Date.parse('2026-09-25T12:00:00Z')

describe('isRecentAuth', () => {
  it('holds for ten minutes after an authentication', () => {
    expect(isRecentAuth({ workspaceKind: 'owner', reauthAt: new Date(now - 9 * 60_000) }, now)).toBe(true)
    expect(isRecentAuth({ workspaceKind: 'owner', reauthAt: new Date(now - 10 * 60_000) }, now)).toBe(false)
    expect(isRecentAuth({ workspaceKind: 'owner', reauthAt: null }, now)).toBe(false)
  })

  it('always holds in a sandbox, where demo users have no password', () => {
    expect(isRecentAuth({ workspaceKind: 'sandbox', reauthAt: null }, now)).toBe(true)
  })
})

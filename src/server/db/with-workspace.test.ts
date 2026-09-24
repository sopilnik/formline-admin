import { describe, expect, it } from 'vitest'
import { parseWorkspaceContext } from '@/server/db/with-workspace'

describe('parseWorkspaceContext', () => {
  it('accepts a proper context', () => {
    const ctx = { workspaceId: '9b2f1c7e-5d3a-4c1b-8e2f-0a1b2c3d4e5f', userId: null, role: 'system' as const }
    expect(parseWorkspaceContext(ctx)).toEqual(ctx)
  })

  it('refuses anything that is not a uuid or a known role', () => {
    expect(() => parseWorkspaceContext({ workspaceId: "x'; drop", userId: null, role: 'owner' })).toThrow()
    expect(() => parseWorkspaceContext({ workspaceId: '9b2f1c7e-5d3a-4c1b-8e2f-0a1b2c3d4e5f', userId: null, role: 'root' as never })).toThrow()
  })
})

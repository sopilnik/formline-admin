import { redirect } from 'next/navigation'
import { describe, expect, it } from 'vitest'
import { reach } from '@/lib/reach'

describe('reach', () => {
  it('passes an answer through', async () => {
    expect(await reach(async () => ({ ok: true }))).toEqual({ ok: true })
    expect(await reach(async () => undefined)).toBeUndefined()
  })

  it('gives null for a request that got no answer', async () => {
    expect(await reach(() => Promise.reject(new TypeError('Failed to fetch')))).toBeNull()
    expect(await reach(() => Promise.reject(new Error('An unexpected response was received from the server.')))).toBeNull()
  })

  it('lets a redirect through', async () => {
    await expect(reach(async () => redirect('/sign-in'))).rejects.toThrow('NEXT_REDIRECT')
  })
})

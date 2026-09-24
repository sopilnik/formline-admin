import { describe, expect, it } from 'vitest'
import { readEnv } from '@/server/env'

const base = { DATABASE_URL: 'postgres://app:secret@127.0.0.1:56432/formline_dev' }

describe('readEnv', () => {
  it('requires the origin secret in production', () => {
    expect(() => readEnv({ ...base, NODE_ENV: 'production' })).toThrow(/ORIGIN_AUTH_SECRET/)
  })

  it('refuses to switch the origin check off in production', () => {
    expect(() => readEnv({ ...base, NODE_ENV: 'production', ORIGIN_AUTH_SECRET: 'x'.repeat(64), ORIGIN_AUTH_DISABLED: '1' })).toThrow(/ORIGIN_AUTH_DISABLED/)
  })

  it('accepts development without a secret', () => {
    expect(readEnv({ ...base, NODE_ENV: 'development', ORIGIN_AUTH_DISABLED: '1' }).NODE_ENV).toBe('development')
  })
})

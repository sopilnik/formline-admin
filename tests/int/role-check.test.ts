import { afterAll, describe, expect, it } from 'vitest'
import { AppRoleError, assertAppRole } from '@/server/db/role-check'
import { adminPool, appPool, closeAll } from './db'

afterAll(closeAll)

describe('assertAppRole', () => {
  it('accepts the app role through the pooler', async () => {
    await expect(assertAppRole(appPool())).resolves.toBeUndefined()
  })

  it('refuses a superuser connection', async () => {
    await expect(assertAppRole(adminPool())).rejects.toThrow(AppRoleError)
    await expect(assertAppRole(adminPool())).rejects.toThrow(/superuser/)
  })
})

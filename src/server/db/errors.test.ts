import { describe, expect, it } from 'vitest'
import { uniqueConstraintOf } from '@/server/db/errors'

describe('uniqueConstraintOf', () => {
  it('names the unique constraint a refused write broke, also behind the error drizzle wraps it in', () => {
    const refused = Object.assign(new Error('duplicate key value'), { code: '23505', constraint: 'products_workspace_id_slug_key' })

    expect(uniqueConstraintOf(refused)).toBe('products_workspace_id_slug_key')
    expect(uniqueConstraintOf(new Error('Failed query', { cause: refused }))).toBe('products_workspace_id_slug_key')
  })

  it('names nothing for any other error', () => {
    expect(uniqueConstraintOf(Object.assign(new Error('check'), { code: '23514', constraint: 'orders_total' }))).toBeUndefined()
    expect(uniqueConstraintOf(new Error('timeout'))).toBeUndefined()
    expect(uniqueConstraintOf(undefined)).toBeUndefined()
  })
})

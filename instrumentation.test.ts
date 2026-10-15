import { inspect } from 'node:util'
import { DrizzleQueryError } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestError } from './instrumentation'

type Context = Parameters<typeof onRequestError>[2]

afterEach(() => vi.unstubAllEnvs())

describe('onRequestError', () => {
  it('leaves no value of a failed query on the error, which Next logs once more after it', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')

    const refused = Object.assign(new Error('canceling statement due to statement timeout'), {
      code: '57014', detail: 'Failing row contains (mia.novak@store.test, Mia Novak).',
    })
    const failed = new DrizzleQueryError('select * from "fa"."customers" where "email" = $1', ['mia.novak@store.test'], refused)

    await onRequestError(failed, { path: '/customers?q=mia.novak', method: 'GET', headers: {} }, { routerKind: 'App Router', routePath: '/customers', routeType: 'render' } as Context)

    const printed = inspect(failed, { depth: 5 })

    expect(printed).not.toContain('mia.novak')
    expect(printed).not.toContain('Mia Novak')
    expect(failed.message).toBe('Failed query: select * from "fa"."customers" where "email" = $1')
    expect(printed).toContain('canceling statement due to statement timeout')
  })
})

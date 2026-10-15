import { Writable } from 'node:stream'
import { DrizzleQueryError } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createLogger, pathOnly } from '@/server/log'

describe('log', () => {
  it('redacts secrets wherever they appear', () => {
    const lines: string[] = []
    const sink = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done() } })

    createLogger(sink).info({ password: 'p', token: 't', user: { secret: 's' }, input: { code: '123456' }, headers: { cookie: 'c', authorization: 'a' } }, 'x')

    const line = lines.join('')

    for (const value of ['"p"', '"t"', '"s"', '"123456"', '"c"', '"a"']) expect(line).not.toContain(value)
    expect(line).toContain('[redacted]')
  })

  it('keeps what an error carries: its message, causes, stack and code', () => {
    const lines: string[] = []
    const sink = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done() } })
    const refused = Object.assign(new Error('duplicate key value', { cause: new Error('the slug is taken') }), { code: '23505' })

    createLogger(sink).error({ event: 'test.failed', err: refused })

    const entry = JSON.parse(lines.join('')) as { err: { message: string; code: string; stack: string } }

    expect(entry.err.code).toBe('23505')
    expect(entry.err.message).toContain('the slug is taken')
    expect(entry.err.stack).toContain('duplicate key value')
  })

  it('keeps no value a failed query ran with, and what the database said about it', () => {
    const lines: string[] = []
    const sink = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done() } })
    const refused = Object.assign(new Error('new row for relation "customers" violates check constraint'), {
      code: '23514', detail: 'Failing row contains (mia.novak@store.test, Mia Novak, Berlin).',
    })
    const failed = new DrizzleQueryError('insert into "fa"."customers" ("email", "name") values ($1, $2)', ['mia.novak@store.test', 'Mia Novak'], refused)

    createLogger(sink).error({ event: 'stripe.failed', err: failed })

    const line = lines.join('')

    for (const value of ['mia.novak', 'Mia Novak', 'Berlin']) expect(line).not.toContain(value)

    const entry = JSON.parse(line) as { err: { message: string; stack: string } }

    expect(entry.err.message).toContain('insert into "fa"."customers"')
    expect(entry.err.message).toContain('violates check constraint')
    expect(entry.err.stack).toContain('Failed query')
  })

  it('keeps a request\'s path without its query string', () => {
    expect(pathOnly('/orders?q=mia.novak%40store.test&page=2')).toBe('/orders')
    expect(pathOnly('/invitations/accept')).toBe('/invitations/accept')
  })
})

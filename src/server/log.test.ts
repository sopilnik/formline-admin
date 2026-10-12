import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger } from '@/server/log'

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
})

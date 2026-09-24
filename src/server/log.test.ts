import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger } from '@/server/log'

describe('log', () => {
  it('redacts secrets wherever they appear', () => {
    const lines: string[] = []
    const sink = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done() } })
    createLogger(sink).info({ password: 'p', token: 't', user: { secret: 's', code: '123456' }, headers: { cookie: 'c', authorization: 'a' } }, 'x')
    const line = lines.join('')
    for (const value of ['"p"', '"t"', '"s"', '"123456"', '"c"', '"a"']) expect(line).not.toContain(value)
    expect(line).toContain('[redacted]')
  })
})

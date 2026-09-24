import { describe, expect, it } from 'vitest'
import { fail, ok } from '@/lib/result'

describe('ActionResult helpers', () => {
  it('wrap data and failures', () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } })
    expect(fail('invalid', { name: 'required' })).toEqual({ ok: false, code: 'invalid', fieldErrors: { name: 'required' } })
    expect(fail('forbidden')).toEqual({ ok: false, code: 'forbidden' })
  })
})

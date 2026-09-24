export type ErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'rate_limited' | 'unavailable'
export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; fieldErrors?: Record<string, string> }

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })

export const fail = (code: ErrorCode, fieldErrors?: Record<string, string>): ActionResult<never> =>
  fieldErrors ? { ok: false, code, fieldErrors } : { ok: false, code }

/** The keys of `auth.errors` in the dictionaries: server results and form states carry them. */
export type AuthError =
  | 'unavailable' | 'rate_limited' | 'token_invalid' | 'name_required' | 'email_invalid' | 'password_too_short'
  | 'password_too_long' | 'password_breached' | 'code_invalid' | 'owner_exists' | 'credentials_invalid'
  | 'second_factor_locked' | 'recovery_invalid' | 'passkey_failed' | 'passkey_unknown' | 'passkey_cancelled'
  | 'session_expired' | 'last_factor' | 'reauth_required' | 'generic'

export type AuthFailure<F extends string = never> = { ok: false; error: AuthError; field?: F; retryAfterSeconds?: number }

export type FormState<F extends string = string> =
  | { status: 'idle' }
  | { status: 'error'; error: AuthError; field?: F; retryAfterMinutes?: number; values?: Partial<Record<F, string>> }
  | { status: 'done'; recoveryCodes?: string[] }

export const IDLE = { status: 'idle' } as const

/** A text field of a submitted form; '' when it is absent or a file. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/** Whole minutes for a "try again in" message, at least one. */
export function retryMinutes(seconds: number | undefined): number | undefined {
  return seconds === undefined ? undefined : Math.max(1, Math.ceil(seconds / 60))
}

/** A failed result as the state of its form; `values` refill the fields that are safe to show again. */
export function failureState<F extends string>(failure: AuthFailure<F>, values?: Partial<Record<F, string>>): FormState<F> {
  return { status: 'error', error: failure.error, field: failure.field, retryAfterMinutes: retryMinutes(failure.retryAfterSeconds), values }
}

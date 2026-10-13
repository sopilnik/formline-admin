export type Limit = { purpose: string; limit: number; windowSeconds: number }

// The rate limits. Windows are fixed. The limits on guesses (the second factor, and the
// password) are claimed before an attempt is checked (attempts.ts), so a burst of requests
// cannot all pass before the first failure counts. The passkey limit is checked with peek()
// before an attempt and counted with consume() after a failed one: a passkey cannot be guessed.
export const LIMITS = {
  signInFailIp: { purpose: 'signin.fail.ip', limit: 20, windowSeconds: 15 * 60 },
  signInFailAccount: { purpose: 'signin.fail.account', limit: 5, windowSeconds: 60 * 60 },
  signInSuccessAccount: { purpose: 'signin.ok.account', limit: 10, windowSeconds: 60 * 60 },
  secondFactorFail: { purpose: 'mfa.fail', limit: 10, windowSeconds: 60 * 60 },
  passkeyFailIp: { purpose: 'passkey.fail.ip', limit: 20, windowSeconds: 15 * 60 },
  setupIp: { purpose: 'setup.ip', limit: 5, windowSeconds: 15 * 60 },
  recoverIp: { purpose: 'recover.ip', limit: 5, windowSeconds: 15 * 60 },
  csvExport: { purpose: 'csv.export', limit: 10, windowSeconds: 60 },
  upload: { purpose: 'media.upload', limit: 20, windowSeconds: 60 * 60 },
  stripeImport: { purpose: 'stripe.import', limit: 3, windowSeconds: 60 * 60 },
} as const satisfies Record<string, Limit>

export const LOCKS = {
  signInAccount: 'signin.lock.account',
  secondFactor: 'mfa.lock',
} as const

export const SECOND_FACTOR_LOCK_SECONDS = 60 * 60
const PASSWORD_LOCK_FIRST_SECONDS = 15 * 60
const PASSWORD_LOCK_MAX_SECONDS = 60 * 60

/** From the account's failure limit in an hour: 15 minutes, doubling per further failure, at most an hour. */
export function passwordLockSeconds(failures: number): number {
  const beyond = failures - LIMITS.signInFailAccount.limit
  if (beyond < 0) return 0
  return Math.min(PASSWORD_LOCK_FIRST_SECONDS * 2 ** beyond, PASSWORD_LOCK_MAX_SECONDS)
}

/** A limit on attempts, the lock it ends in, and how long that lock holds after a given count of attempts. */
export type AttemptGuard = { limit: Limit; lock: string; lockSeconds: (count: number) => number }

/** The second factor: ten attempts an hour, and the tenth that fails locks it for an hour. */
export const GUARDS = {
  secondFactor: {
    limit: LIMITS.secondFactorFail,
    lock: LOCKS.secondFactor,
    lockSeconds: count => count >= LIMITS.secondFactorFail.limit ? SECOND_FACTOR_LOCK_SECONDS : 0,
  },
} as const satisfies Record<string, AttemptGuard>

export type Limit = { purpose: string; limit: number; windowSeconds: number }

// Spec §5.4. Windows are fixed. Failure limits are checked with peek() before an
// attempt and counted with consume() after a failed one.
export const LIMITS = {
  signInFailIp: { purpose: 'signin.fail.ip', limit: 20, windowSeconds: 15 * 60 },
  signInFailAccount: { purpose: 'signin.fail.account', limit: 5, windowSeconds: 60 * 60 },
  signInSuccessAccount: { purpose: 'signin.ok.account', limit: 10, windowSeconds: 60 * 60 },
  secondFactorFail: { purpose: 'mfa.fail', limit: 10, windowSeconds: 60 * 60 },
  passkeyFailIp: { purpose: 'passkey.fail.ip', limit: 20, windowSeconds: 15 * 60 },
  setupIp: { purpose: 'setup.ip', limit: 5, windowSeconds: 15 * 60 },
  recoverIp: { purpose: 'recover.ip', limit: 5, windowSeconds: 15 * 60 },
  csvExport: { purpose: 'csv.export', limit: 10, windowSeconds: 60 },
} as const satisfies Record<string, Limit>

export const LOCKS = {
  signInAccount: 'signin.lock.account',
  secondFactor: 'mfa.lock',
} as const

export const SECOND_FACTOR_LOCK_SECONDS = 60 * 60

/** After the fifth password failure in an hour: 15 minutes, doubling per further failure, at most an hour. */
export function passwordLockSeconds(failures: number): number {
  if (failures < 5) return 0
  return Math.min(15 * 60 * 2 ** (failures - 5), 60 * 60)
}

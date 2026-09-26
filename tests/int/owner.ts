import { generateHOTP } from '@oslojs/otp'
import type pg from 'pg'

/** The owner every auth test uses; the setup test creates it with exactly these values. */
export const OWNER = { name: 'Test Owner', email: 'owner@formline.test', password: 'plum-kettle-sunrise-4471' }
export const OWNER_TOTP_SECRET = new Uint8Array(20).fill(7)
export const noBreach = async (): Promise<boolean> => false

/**
 * A code and a clock at its step: one step after the owner's last accepted step,
 * and well ahead of now. Codes work once, and the test files share one database.
 */
export async function nextTotp(admin: pg.Pool): Promise<{ code: string; now: () => number }> {
  const { rows } = await admin.query<{ step: string | null }>(
    "select u.totp_last_step as step from fa.users u join fa.workspaces w on w.id = u.workspace_id where w.kind = 'owner' and u.role = 'owner'")
  const last = rows[0]?.step ? Number(rows[0].step) : 0
  const step = Math.max(last, Math.floor(Date.now() / 30_000) + 100) + 1
  return { code: generateHOTP(OWNER_TOTP_SECRET, BigInt(step), 6), now: () => step * 30_000 + 5_000 }
}

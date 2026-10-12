import { parseLocale, type Locale } from '@/i18n/locale'
import { formatDateTime } from '@/lib/intl'
import { asRecord, count, text, type Payload } from '@/lib/payload'
import { ASSIGNABLE_ROLES } from '@/lib/team'

/** Every letter the panel writes (spec §9); nothing is ever sent, the outbox keeps them. */
export const LETTER_TEMPLATES = ['auth.new_sign_in', 'auth.second_factor_locked', 'auth.recovery_code_used', 'team.invitation'] as const
export type LetterTemplate = (typeof LETTER_TEMPLATES)[number]

/** A dictionary key under `letters` with its values, already formatted. */
export type LetterPart<K extends string = LetterKey> = { key: K; values?: Record<string, string | number> }

export type LetterKey =
  | 'unknown.subject' | 'unknown.body'
  | 'newSignIn.subject' | 'newSignIn.body' | 'newSignIn.bodyNoDevice' | 'newSignIn.ifNotYou' | 'newSignIn.action'
  | 'secondFactorLocked.subject' | 'secondFactorLocked.body' | 'secondFactorLocked.ifNotYou' | 'secondFactorLocked.action'
  | 'recoveryCodeUsed.subject' | 'recoveryCodeUsed.body' | 'recoveryCodeUsed.ifNotYou' | 'recoveryCodeUsed.action'
  | 'invitation.subject' | 'invitation.body.admin' | 'invitation.body.manager' | 'invitation.body.viewer' | 'invitation.body.unknown'
  | 'invitation.note' | 'invitation.action'

/** What a letter says, independent of how it is shown: the outbox page renders it with the dictionaries. */
export type LetterContent = {
  /** The recipient's language when the letter was written (his decision, 29 September). */
  locale: Locale
  /** The greeting's name; null writes no greeting. */
  name: string | null
  subject: LetterPart
  paragraphs: LetterPart[]
  /** The one link of the letter: a real address inside the panel. */
  action: (LetterPart & { href: string }) | null
}

/** The moment in the letter, in its language and the store's zone; an unreadable one shows as a dash. */
function when(payload: Payload, locale: Locale, timeZone: string): string {
  const at = text(payload, 'at')
  const date = at ? new Date(at) : null
  return date && !Number.isNaN(date.getTime()) ? formatDateTime(date, locale, timeZone) : '—'
}

const SECURITY = '/settings/security'

/** An invitation token: 32 characters of lower-case base32, as every token of the panel (src/server/auth/tokens.ts). */
const INVITATION_TOKEN = /^[a-z2-7]{32}$/

/**
 * Reads a stored letter (spec §9). The payload is what the letter was written with; a missing or
 * malformed field falls back to a plainer sentence instead of failing, and an unknown template shows
 * as a letter without a body.
 */
export function letterContent(template: string, rawPayload: unknown, timeZone: string): LetterContent {
  const payload = asRecord(rawPayload) ?? {}
  const locale = parseLocale(text(payload, 'locale'))
  const name = text(payload, 'name')
  const date = when(payload, locale, timeZone)
  switch (template) {
    case 'auth.new_sign_in': {
      const device = text(payload, 'device')
      return {
        locale, name,
        subject: { key: 'newSignIn.subject' },
        paragraphs: [
          device ? { key: 'newSignIn.body', values: { date, device } } : { key: 'newSignIn.bodyNoDevice', values: { date } },
          { key: 'newSignIn.ifNotYou' },
        ],
        action: { key: 'newSignIn.action', href: SECURITY },
      }
    }
    case 'auth.second_factor_locked':
      return {
        locale, name,
        subject: { key: 'secondFactorLocked.subject' },
        paragraphs: [{ key: 'secondFactorLocked.body', values: { date } }, { key: 'secondFactorLocked.ifNotYou' }],
        action: { key: 'secondFactorLocked.action', href: SECURITY },
      }
    case 'auth.recovery_code_used':
      return {
        locale, name,
        subject: { key: 'recoveryCodeUsed.subject' },
        paragraphs: [{ key: 'recoveryCodeUsed.body', values: { date, remaining: count(payload, 'remaining') ?? 0 } }, { key: 'recoveryCodeUsed.ifNotYou' }],
        action: { key: 'recoveryCodeUsed.action', href: SECURITY },
      }
    case 'team.invitation': {
      // The letter goes to someone who is not a member yet: no greeting by name.
      const inviter = text(payload, 'inviter') ?? '—'
      const role = ASSIGNABLE_ROLES.find(r => r === payload.role)
      const token = text(payload, 'token')
      return {
        locale, name: null,
        subject: { key: 'invitation.subject', values: { inviter } },
        paragraphs: [{ key: role ? `invitation.body.${role}` : 'invitation.body.unknown', values: { inviter } }, { key: 'invitation.note' }],
        action: token && INVITATION_TOKEN.test(token) ? { key: 'invitation.action', href: `/invite/${token}` } : null,
      }
    }
    default:
      return { locale, name: null, subject: { key: 'unknown.subject' }, paragraphs: [{ key: 'unknown.body' }], action: null }
  }
}

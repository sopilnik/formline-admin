import { cleanLine } from '@/lib/text'

/** The roles an owner or an admin can give: never `owner`, which only setup creates. */
export const ASSIGNABLE_ROLES = ['admin', 'manager', 'viewer'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/** An invitation's fields: a refused invitation hands its values back to the form under these keys. */
export const INVITE_FIELDS = ['email', 'role'] as const
export type InviteField = (typeof INVITE_FIELDS)[number]
export const EMAIL_MAX = 254
/** A member's name, as the users table allows it. */
export const MEMBER_NAME_MAX = 120

/**
 * A member's name as a form sends it: cleaned (src/lib/text.ts), from one character to MEMBER_NAME_MAX; null when it is
 * empty or longer. The form's maxLength keeps an honest browser within the limit, so only a crafted request meets the second
 * refusal.
 */
export function memberName(raw: string): string | null {
  const name = cleanLine(raw)
  const length = [...name].length

  return length >= 1 && length <= MEMBER_NAME_MAX ? name : null
}

/** Members and open invitations together, so a sandbox stays small. */
export const TEAM_CAP = 20

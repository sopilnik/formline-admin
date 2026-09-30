/** The roles an owner or an admin can give (spec §5.5): never `owner`, which only setup creates. */
export const ASSIGNABLE_ROLES = ['admin', 'manager', 'viewer'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/** An invitation's fields, shared by the form and the server's parser (spec §5.6: no Zod in the browser). */
export const INVITE_FIELDS = ['email', 'role'] as const
export type InviteField = (typeof INVITE_FIELDS)[number]
export const EMAIL_MAX = 254
/** A member's name, as the users table allows it. */
export const MEMBER_NAME_MAX = 120
/** Members and open invitations together, so a sandbox stays small (spec §6.5). */
export const TEAM_CAP = 20

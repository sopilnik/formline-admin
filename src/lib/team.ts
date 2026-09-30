/** The roles an owner or an admin can give (spec §5.5): never `owner`, which only setup creates. */
export const ASSIGNABLE_ROLES = ['admin', 'manager', 'viewer'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/**
 * Every action the activity log records, in the groups the log's filter offers.
 * `tests/unit/activity-actions.test.ts` holds this list against the code that writes the log.
 */
export const ACTIVITY_GROUPS = [
  { group: 'orders', actions: ['order.status_changed', 'order.note_added', 'orders.exported', 'orders.imported'] },
  {
    group: 'catalog',
    actions: [
      'product.created', 'product.updated', 'product.variants_updated', 'product.status_changed', 'product.image_changed',
      'product.image_removed', 'product.deleted', 'collection.created', 'collection.updated', 'collection.moved', 'collection.deleted',
    ],
  },
  { group: 'customers', actions: ['customer.notes_updated', 'customers.exported'] },
  {
    group: 'team',
    actions: [
      'team.invited', 'team.invitation_resent', 'team.invitation_revoked', 'team.invitation_accepted', 'team.role_changed',
      'team.deactivated', 'team.reactivated',
    ],
  },
  {
    group: 'security',
    actions: [
      'auth.sign_in', 'auth.sign_in_failed', 'auth.sign_out', 'auth.second_factor_failed', 'auth.second_factor_locked',
      'auth.recovery_code_used', 'auth.reauthenticated', 'auth.password_changed', 'auth.totp_enabled', 'auth.totp_replaced',
      'auth.totp_disabled', 'auth.recovery_codes_regenerated', 'auth.passkey_added', 'auth.passkey_removed', 'auth.session_revoked',
      'auth.other_sessions_revoked', 'auth.owner_created', 'auth.owner_recovered',
    ],
  },
  { group: 'settings', actions: ['profile.updated', 'settings.store_updated'] },
  { group: 'sandbox', actions: ['sandbox.created', 'sandbox.switched_user'] },
] as const

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number]['group']
export type ActivityAction = (typeof ACTIVITY_GROUPS)[number]['actions'][number]

export const ACTIVITY_ACTIONS: readonly ActivityAction[] = ACTIVITY_GROUPS.flatMap(g => g.actions)

export function isActivityAction(value: string): value is ActivityAction {
  return (ACTIVITY_ACTIONS as readonly string[]).includes(value)
}

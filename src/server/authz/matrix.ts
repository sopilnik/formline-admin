import type { workspaceKind } from '@/server/db/schema'
import type { Role } from '@/server/db/with-workspace'

/** A workspace's kind, as the database's `fa.workspace_kind` enum has it. */
export type WorkspaceKind = (typeof workspaceKind.enumValues)[number]

export type Action =
  | 'data.read' | 'csv.export' | 'orders.update' | 'catalog.write' | 'catalog.delete' | 'customers.notes'
  | 'activity.read' | 'outbox.read' | 'team.read' | 'team.manage' | 'settings.store' | 'stripe.import' | 'self.manage' | 'sandbox.tools'

const EVERYONE: readonly Role[] = ['owner', 'admin', 'manager', 'viewer']
const EDITORS: readonly Role[] = ['owner', 'admin', 'manager']
const LEADS: readonly Role[] = ['owner', 'admin']

// Who may do what. The database enforces the same boundaries again (row-level security
// and the users trigger); this matrix decides what the interface offers and what
// every Server Action accepts.
const MATRIX: Record<Action, { roles: readonly Role[]; kinds: readonly WorkspaceKind[] }> = {
  'data.read': { roles: EVERYONE, kinds: ['owner', 'sandbox'] },
  'csv.export': { roles: EVERYONE, kinds: ['owner', 'sandbox'] },
  'orders.update': { roles: EDITORS, kinds: ['owner', 'sandbox'] },
  'catalog.write': { roles: EDITORS, kinds: ['owner', 'sandbox'] },
  'catalog.delete': { roles: EDITORS, kinds: ['owner', 'sandbox'] },
  'customers.notes': { roles: EDITORS, kinds: ['owner', 'sandbox'] },
  'activity.read': { roles: LEADS, kinds: ['owner', 'sandbox'] },
  'outbox.read': { roles: LEADS, kinds: ['owner', 'sandbox'] },
  // The team page: owners and admins; in the owner workspace it shows the owner and a note.
  'team.read': { roles: LEADS, kinds: ['owner', 'sandbox'] },
  'team.manage': { roles: LEADS, kinds: ['sandbox'] },
  'settings.store': { roles: LEADS, kinds: ['owner', 'sandbox'] },
  'stripe.import': { roles: ['owner'], kinds: ['owner'] },
  'self.manage': { roles: EVERYONE, kinds: ['owner', 'sandbox'] },
  'sandbox.tools': { roles: EVERYONE, kinds: ['sandbox'] },
}

export function can(role: Role, action: Action, kind: WorkspaceKind): boolean {
  const rule = MATRIX[action]
  return rule.roles.includes(role) && rule.kinds.includes(kind)
}

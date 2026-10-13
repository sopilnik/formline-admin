import { can, type Action, type WorkspaceKind } from '@/server/authz/matrix'
import type { Role } from '@/server/db/with-workspace'

export type NavKey = 'overview' | 'orders' | 'products' | 'collections' | 'customers' | 'team' | 'activity' | 'outbox' | 'settings'
export type NavItem = { key: NavKey; href: string; group: 'store' | 'admin'; count?: number }

const ITEMS: (NavItem & { action?: Action })[] = [
  { key: 'overview', href: '/overview', group: 'store' },
  { key: 'orders', href: '/orders', group: 'store' },
  { key: 'products', href: '/products', group: 'store' },
  { key: 'collections', href: '/collections', group: 'store' },
  { key: 'customers', href: '/customers', group: 'store' },
  { key: 'team', href: '/team', group: 'admin', action: 'team.read' },
  { key: 'activity', href: '/activity', group: 'admin', action: 'activity.read' },
  { key: 'outbox', href: '/outbox', group: 'admin', action: 'outbox.read' },
  { key: 'settings', href: '/settings', group: 'admin' },
]

/**
 * The menu for a role. It only hides what the role cannot use; every page checks again on the server.
 * `counts` puts a number on an item — today the orders to process; zero shows nothing.
 */
export function navItems(role: Role, kind: WorkspaceKind, counts: Partial<Record<NavKey, number>> = {}): NavItem[] {
  return ITEMS.filter(item => !item.action || can(role, item.action, kind)).map(({ key, href, group }) => {
    const count = counts[key]
    return count ? { key, href, group, count } : { key, href, group }
  })
}

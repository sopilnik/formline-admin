/** What the log knows about the entities of one page, read from their tables by id (spec §8.7: the entity is linked). */
export type Lookups = {
  users: ReadonlyMap<string, string>
  orders: ReadonlyMap<string, number>
  products: ReadonlyMap<string, { slug: string; name: string }>
  collections: ReadonlyMap<string, { slug: string; name: string }>
  customers: ReadonlyMap<string, string>
}

export type EntryInput = { action: string; entityType: string | null; entityId: string | null; details: unknown }

/** The entity an entry is about: its current name with a link, or the name it had when it was deleted. */
export type Subject = { text: string; href: string | null }

/** The short detail of an entry. Codes (statuses, roles, field names) are translated by the page; the rest is data. */
export type Detail =
  | { kind: 'orderStatus' | 'productStatus' | 'role'; from: string; to: string; bulk?: boolean }
  | { kind: 'rows'; count: number; truncated: boolean }
  | { kind: 'fields'; fields: string[] }
  | { kind: 'variants'; count: number }
  | { kind: 'image'; width: number; height: number }
  | { kind: 'position'; from: number; to: number }
  | { kind: 'invited'; email: string; role: string }
  | { kind: 'joined'; role: string }
  | { kind: 'method'; method: 'password' | 'passkey' }
  | { kind: 'remaining'; count: number }
  | { kind: 'device'; device: string }
  | { kind: 'devices'; count: number }

type Details = Record<string, unknown>

const text = (details: Details, key: string): string | null => (typeof details[key] === 'string' && details[key] !== '' ? (details[key] as string) : null)
const whole = (details: Details, key: string): number | null => (typeof details[key] === 'number' && Number.isInteger(details[key]) ? (details[key] as number) : null)

function subjectOf(entry: EntryInput, details: Details, lookups: Lookups): Subject | null {
  const id = entry.entityId
  switch (entry.entityType) {
    case 'order': {
      const number = (id ? lookups.orders.get(id) : undefined) ?? whole(details, 'number')
      return number === null ? null : { text: `#${number}`, href: `/orders/${number}` }
    }
    case 'product': {
      const product = id ? lookups.products.get(id) : undefined
      if (product) return { text: product.name, href: `/products/${product.slug}` }
      const name = text(details, 'name') ?? text(details, 'slug')
      return name ? { text: name, href: null } : null
    }
    case 'collection': {
      const collection = id ? lookups.collections.get(id) : undefined
      if (collection) return { text: collection.name, href: `/collections/${collection.slug}` }
      const name = text(details, 'name') ?? text(details, 'slug')
      return name ? { text: name, href: null } : null
    }
    case 'customer': {
      const name = (id ? lookups.customers.get(id) : undefined) ?? text(details, 'name')
      return name ? { text: name, href: id && lookups.customers.has(id) ? `/customers/${id}` : null } : null
    }
    case 'user': {
      const name = (id ? lookups.users.get(id) : undefined) ?? text(details, 'name')
      return name ? { text: name, href: null } : null
    }
    case 'invitation': {
      const email = text(details, 'email')
      return email ? { text: email, href: null } : null
    }
    default:
      return null
  }
}

function detailOf(action: string, details: Details): Detail | null {
  const from = text(details, 'from')
  const to = text(details, 'to')
  switch (action) {
    case 'order.status_changed':
      return from && to ? { kind: 'orderStatus', from, to, bulk: details.bulk === true } : null
    case 'product.status_changed':
      return from && to ? { kind: 'productStatus', from, to } : null
    case 'team.role_changed':
      return from && to ? { kind: 'role', from, to } : null
    case 'orders.exported':
    case 'customers.exported': {
      const rows = whole(details, 'rows')
      return rows === null ? null : { kind: 'rows', count: rows, truncated: details.truncated === true }
    }
    case 'product.updated':
    case 'profile.updated':
    case 'settings.store_updated': {
      const fields = Array.isArray(details.changed) ? details.changed.filter((f): f is string => typeof f === 'string') : []
      return fields.length > 0 ? { kind: 'fields', fields } : null
    }
    case 'product.created':
    case 'product.deleted': {
      const count = whole(details, 'variants')
      return count === null ? null : { kind: 'variants', count }
    }
    case 'product.variants_updated':
      return Array.isArray(details.variants) ? { kind: 'variants', count: details.variants.length } : null
    case 'product.image_changed': {
      const width = whole(details, 'width')
      const height = whole(details, 'height')
      return width !== null && height !== null ? { kind: 'image', width, height } : null
    }
    case 'collection.moved': {
      const a = whole(details, 'from')
      const b = whole(details, 'to')
      return a !== null && b !== null ? { kind: 'position', from: a, to: b } : null
    }
    case 'team.invited':
    case 'team.invitation_resent': {
      const email = text(details, 'email')
      const role = text(details, 'role')
      return email && role ? { kind: 'invited', email, role } : null
    }
    case 'team.invitation_accepted': {
      const role = text(details, 'role')
      return role ? { kind: 'joined', role } : null
    }
    case 'auth.sign_in':
    case 'auth.sign_in_failed':
    case 'auth.reauthenticated': {
      const method = text(details, 'method')
      return method === 'password' || method === 'passkey' ? { kind: 'method', method } : null
    }
    case 'auth.recovery_code_used': {
      const remaining = whole(details, 'remaining')
      return remaining === null ? null : { kind: 'remaining', count: remaining }
    }
    case 'auth.session_revoked': {
      const device = text(details, 'device')
      return device ? { kind: 'device', device } : null
    }
    case 'auth.other_sessions_revoked':
    case 'auth.password_changed': {
      const count = whole(details, 'count') ?? whole(details, 'signedOut')
      return count === null ? null : { kind: 'devices', count }
    }
    default:
      return null
  }
}

/**
 * What the log shows for an entry (spec §8.7): the entity it is about, linked while it exists, and a short detail.
 * A malformed or missing detail shows nothing rather than failing: the log is read long after it is written.
 */
export function describeEntry(entry: EntryInput, lookups: Lookups): { subject: Subject | null; detail: Detail | null } {
  const details: Details = entry.details !== null && typeof entry.details === 'object' ? (entry.details as Details) : {}
  return { subject: subjectOf(entry, details, lookups), detail: detailOf(entry.action, details) }
}

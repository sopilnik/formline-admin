import 'server-only'
import { createHmac } from 'node:crypto'
// The demo's own people (spec §6.3): a store customer becomes one of them.
// eslint-disable-next-line no-restricted-imports
import { FIRST_NAMES, LAST_NAMES, PLACES } from '../../../db/seed/people'

export type Pseudonym = { name: string; email: string; city: string; country: string }

/**
 * The demo person a store customer becomes (spec §7.3, §7.4), chosen by an HMAC of their email under PSEUDONYM_KEY: the
 * same customer is always the same person, and without the key the person does not lead back to the email. The name
 * and the place come from the demo's lists; the email carries part of the HMAC, so two customers never share one.
 */
export function pseudonymFor(email: string, key: string): Pseudonym {
  const digest = createHmac('sha256', key).update(email.trim().toLowerCase()).digest()
  const first = FIRST_NAMES[digest.readUInt16BE(0) % FIRST_NAMES.length]!
  const last = LAST_NAMES[digest.readUInt16BE(2) % LAST_NAMES.length]!
  const place = PLACES[digest.readUInt16BE(4) % PLACES.length]!
  const local = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '')
  return { name: `${first} ${last}`, email: `${local}.${digest.subarray(6, 10).toString('hex')}@pseudonym.example`, city: place.city, country: place.country }
}

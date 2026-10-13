import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

function groups(part: string): string[] {
  if (!part) return []
  return part.split(':').flatMap(group => {
    if (!group.includes('.')) return [group]
    const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number)
    return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)]
  })
}

function expandIpv6(ip: string): string[] {
  const [head = '', tail] = ip.toLowerCase().split('::')
  const left = groups(head)
  if (tail === undefined) return left.map(g => parseInt(g, 16).toString(16))
  const right = groups(tail)
  const zeros = Array<string>(8 - left.length - right.length).fill('0')
  return [...left, ...zeros, ...right].map(g => parseInt(g, 16).toString(16))
}

/**
 * The rate-limit identity of a client address: IPv4 exactly, IPv6 by
 * its /64 (one customer network), an IPv4-mapped IPv6 address as its IPv4 address.
 */
export function ipKey(ip: string | null): string | null {
  if (!ip) return null
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped && isIP(mapped[1]!) === 4) return `v4:${mapped[1]}`
  const version = isIP(ip)
  if (version === 4) return `v4:${ip}`
  if (version !== 6) return null
  return `v6:${expandIpv6(ip).slice(0, 4).join(':')}`
}

const hmac = (key: string, value: string): string => createHmac('sha256', key).update(value).digest('hex')

/** The only form in which an address is ever stored. */
export function hashIp(ip: string | null, key: string): string | null {
  const k = ipKey(ip)
  return k ? hmac(key, k) : null
}

/** Addresses the edge did not supply (local development) share one bucket. */
export const ipSubject = (ip: string | null, key: string): string => `ip:${hashIp(ip, key) ?? 'unknown'}`

/** Counted for unknown emails too, so a lockout reveals nothing about which accounts exist. */
export const accountSubject = (email: string, key: string): string =>
  `account:${hmac(key, `account:${email.trim().toLowerCase()}`)}`

/** A user's own counters and locks. Every sandbox copies the template's user ids, so the workspace is part of the key. */
export const userSubject = (workspaceId: string, userId: string): string => `user:${workspaceId}:${userId}`

/** Per-session limits are keyed by the session's token hash, which is also its row id. */
export const sessionSubject = (sessionId: string): string => `session:${sessionId}`

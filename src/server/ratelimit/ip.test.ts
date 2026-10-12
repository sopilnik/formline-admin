import { describe, expect, it } from 'vitest'
import { accountSubject, hashIp, ipKey, ipSubject, userSubject } from '@/server/ratelimit/ip'

const KEY = 'k'.repeat(32)

describe('ipKey', () => {
  it('keys IPv4 exactly', () => {
    expect(ipKey('203.0.113.10')).toBe('v4:203.0.113.10')
  })

  it('keys IPv6 by its /64', () => {
    expect(ipKey('2001:db8:1:2:3:4:5:6')).toBe('v6:2001:db8:1:2')
    expect(ipKey('2001:0db8:0001:0002::9')).toBe('v6:2001:db8:1:2')
    expect(ipKey('::1')).toBe('v6:0:0:0:0')
    expect(ipKey('64:ff9b::192.0.2.1')).toBe('v6:64:ff9b:0:0')
  })

  it('keys an IPv4-mapped IPv6 address as the IPv4 address', () => {
    expect(ipKey('::ffff:203.0.113.10')).toBe('v4:203.0.113.10')
  })

  it('refuses anything that is not an address', () => {
    expect(ipKey(null)).toBeNull()
    expect(ipKey('')).toBeNull()
    expect(ipKey('not-an-ip')).toBeNull()
  })
})

describe('hashing', () => {
  it('stores an address only as its keyed hash', () => {
    const hash = hashIp('203.0.113.10', KEY)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashIp('203.0.113.10', KEY)).toBe(hash)
    expect(hashIp('203.0.113.10', 'x'.repeat(32))).not.toBe(hash)
    expect(hashIp('2001:db8:1:2::1', KEY)).toBe(hashIp('2001:db8:1:2::2', KEY))
    expect(hashIp(null, KEY)).toBeNull()
  })

  it('builds the rate-limit subjects', () => {
    expect(ipSubject('203.0.113.10', KEY)).toBe(`ip:${hashIp('203.0.113.10', KEY)}`)
    expect(ipSubject(null, KEY)).toBe('ip:unknown')
    expect(accountSubject(' Owner@Formline.test ', KEY)).toBe(accountSubject('owner@formline.test', KEY))
    expect(accountSubject('owner@formline.test', KEY)).toMatch(/^account:[0-9a-f]{64}$/)
    const user = '9b2f1c7e-5d3a-4c1b-8e2f-0a1b2c3d4e5f'
    expect(userSubject('0f1e2d3c-4b5a-4968-8776-655443322110', user)).toBe(`user:0f1e2d3c-4b5a-4968-8776-655443322110:${user}`)
    expect(userSubject('0f1e2d3c-4b5a-4968-8776-655443322110', user)).not.toBe(userSubject('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', user))
  })
})

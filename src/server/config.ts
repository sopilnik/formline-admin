import 'server-only'
import { readEnv, type EnvSource } from '@/server/env'

export type Keyring = { current: string; keys: ReadonlyMap<string, Buffer> }

export type AuthConfig = {
  ipHashKey: string
  cookieSigningKey: string
  totpKeys: Keyring
  setupToken: string | null
  siteUrl: URL
  /** The passkey relying party: the site's host name. */
  rpId: string
  origin: string
}

/** `id:base64,id:base64`: the first key encrypts, every key decrypts, so keys can rotate (spec §5.3). */
export function parseKeyring(value: string): Keyring {
  const keys = new Map<string, Buffer>()
  for (const entry of value.split(',')) {
    const [id = '', encoded = ''] = entry.split(':')
    const key = Buffer.from(encoded, 'base64')
    if (key.length !== 32) throw new Error(`TOTP key ${id} is not 32 bytes`)
    if (keys.has(id)) throw new Error(`TOTP key id ${id} is repeated`)
    keys.set(id, key)
  }
  return { current: [...keys.keys()][0]!, keys }
}

let cached: AuthConfig | undefined

export function authConfig(source?: EnvSource): AuthConfig {
  if (!source && cached) return cached
  const env = readEnv(source)
  const siteUrl = new URL(env.SITE_URL)
  const config: AuthConfig = {
    ipHashKey: env.IP_HASH_KEY,
    cookieSigningKey: env.COOKIE_SIGNING_KEY,
    totpKeys: parseKeyring(env.TOTP_ENCRYPTION_KEYS),
    setupToken: env.OWNER_SETUP_TOKEN ?? null,
    siteUrl,
    rpId: siteUrl.hostname,
    origin: siteUrl.origin,
  }
  if (!source) cached = config
  return config
}

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

/** `id:base64,id:base64`: the first key encrypts, every key decrypts, so keys can rotate. */
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

/** The Stripe ingest's settings; null when they are not set, and the webhook and the import then answer 503. */
export type StripeConfig = {
  webhookSecret: string
  restrictedKey: string
  pseudonymKey: string
  /** A local stand-in for Stripe's API (development and the end-to-end tests); null means Stripe itself. */
  apiBase: URL | null
}

let stripeCached: StripeConfig | null | undefined

export function stripeConfig(source?: EnvSource): StripeConfig | null {
  if (!source && stripeCached !== undefined) return stripeCached

  const env = readEnv(source)
  const config = env.STRIPE_WEBHOOK_SECRET && env.STRIPE_RESTRICTED_KEY && env.PSEUDONYM_KEY
    ? {
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        restrictedKey: env.STRIPE_RESTRICTED_KEY,
        pseudonymKey: env.PSEUDONYM_KEY,
        apiBase: env.STRIPE_API_BASE ? new URL(env.STRIPE_API_BASE) : null,
      }
    : null

  if (!source) stripeCached = config

  return config
}

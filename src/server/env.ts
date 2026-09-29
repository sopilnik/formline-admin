import { z } from 'zod'

// id:base64 pairs; every key is 32 bytes (openssl rand -base64 32).
const KEYRING = /^[a-z0-9]{1,8}:[A-Za-z0-9+/]{43}=(,[a-z0-9]{1,8}:[A-Za-z0-9+/]{43}=)*$/

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  ORIGIN_AUTH_SECRET: z.string().min(32).optional(),
  ORIGIN_AUTH_DISABLED: z.enum(['0', '1']).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SITE_URL: z.url().default('http://localhost:3000'),
  IP_HASH_KEY: z.string().min(32),
  COOKIE_SIGNING_KEY: z.string().min(32),
  TOTP_ENCRYPTION_KEYS: z.string().regex(KEYRING, 'comma-separated id:key pairs, each key 32 bytes in base64'),
  OWNER_SETUP_TOKEN: z.string().min(32).optional(),
  // The media zone for uploads (spec §8.4): the three go together; the host is one of bunny's storage endpoints.
  BUNNY_STORAGE_ZONE: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
  BUNNY_STORAGE_HOST: z.string().regex(/^([a-z0-9-]+\.)?storage\.bunnycdn\.com$/).optional(),
  BUNNY_STORAGE_KEY: z.string().min(20).optional(),
  /** A local folder that stands in for the media zone in development and in the end-to-end tests. */
  MEDIA_STORAGE_DIR: z.string().min(1).optional(),
}).superRefine((env, ctx) => {
  const bunny = [env.BUNNY_STORAGE_ZONE, env.BUNNY_STORAGE_HOST, env.BUNNY_STORAGE_KEY].filter(Boolean).length
  if (bunny !== 0 && bunny !== 3) ctx.addIssue({ code: 'custom', path: ['BUNNY_STORAGE_ZONE'], message: 'BUNNY_STORAGE_ZONE, BUNNY_STORAGE_HOST and BUNNY_STORAGE_KEY go together' })
  if (env.NODE_ENV !== 'production') return
  if (!env.ORIGIN_AUTH_SECRET) ctx.addIssue({ code: 'custom', path: ['ORIGIN_AUTH_SECRET'], message: 'required in production' })
  if (env.ORIGIN_AUTH_DISABLED === '1') ctx.addIssue({ code: 'custom', path: ['ORIGIN_AUTH_DISABLED'], message: 'not allowed in production' })
  const site = new URL(env.SITE_URL)
  if (site.protocol !== 'https:' && site.hostname !== 'localhost') {
    ctx.addIssue({ code: 'custom', path: ['SITE_URL'], message: 'must be https in production' })
  }
})

export type Env = z.infer<typeof schema>

// Record<string, string | undefined> rather than NodeJS.ProcessEnv: Next.js augments
// ProcessEnv with a required NODE_ENV, which would force every test fixture to repeat
// it even though the schema above already defaults it.
export type EnvSource = Record<string, string | undefined>

/** Validates the environment; the server refuses to start on a bad one (instrumentation.ts). */
export function readEnv(source: EnvSource = process.env): Env {
  return schema.parse(source)
}

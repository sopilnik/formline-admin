import { cookies } from 'next/headers'
import { authenticationOptions, CHALLENGE_COOKIE, CHALLENGE_COOKIE_OPTIONS, CHALLENGE_TTL_SECONDS, challengeCookie } from '@/server/auth/passkeys'
import { authConfig } from '@/server/config'

export const dynamic = 'force-dynamic'

/** A passkey sign-in challenge in a signed five-minute cookie. No database access. */
export async function GET(): Promise<Response> {
  const config = authConfig()
  const options = await authenticationOptions(config)
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, challengeCookie(options.challenge, 'auth', undefined, config, Date.now()), {
    ...CHALLENGE_COOKIE_OPTIONS,
    maxAge: CHALLENGE_TTL_SECONDS,
  })
  return Response.json(options, { headers: { 'Cache-Control': 'no-store' } })
}

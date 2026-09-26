import type { BrowserContext } from '@playwright/test'
import { E2E_BASE_URL, E2E_SESSION_COOKIE } from './constants'
import { createSandboxSession, type Role } from './db'

/** Signs the browser context in as a fresh sandbox user of the given role. */
export async function signInAsSandboxUser(context: BrowserContext, role: Role = 'owner'): Promise<void> {
  const { token } = await createSandboxSession(role)
  // The Chrome DevTools Protocol only accepts a __Host- cookie for an https URL, even though
  // Chrome treats localhost itself as trustworthy enough to send it over the plain http server.
  const cookieUrl = E2E_BASE_URL.replace('http://', 'https://')
  await context.addCookies([{ name: E2E_SESSION_COOKIE, value: token, url: cookieUrl, httpOnly: true, secure: true, sameSite: 'Lax' }])
}

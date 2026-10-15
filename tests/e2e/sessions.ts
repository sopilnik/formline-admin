import type { BrowserContext } from '@playwright/test'
import { E2E_BASE_URL, E2E_DEMO_COOKIE, E2E_SESSION_COOKIE } from './constants.ts'
import { createOwnerSession, createSandboxSession, type Role } from './db.ts'

/** Signs the browser context in as a user of a fresh sandbox, the way a real visitor's cookies look. */
export async function signInAsSandboxUser(context: BrowserContext, role: Role = 'owner'): Promise<{ token: string; workspaceId: string; userId: string }> {
  const fixture = await createSandboxSession(role)
  // The Chrome DevTools Protocol only accepts a __Host- cookie for an https URL, even though
  // Chrome treats localhost itself as trustworthy enough to send it over the plain http server.
  const cookieUrl = E2E_BASE_URL.replace('http://', 'https://')

  await context.addCookies([
    { name: E2E_SESSION_COOKIE, value: fixture.token, url: cookieUrl, httpOnly: true, secure: true, sameSite: 'Lax' },
    { name: E2E_DEMO_COOKIE, value: '1', url: cookieUrl, httpOnly: true, secure: true, sameSite: 'Lax' },
  ])

  return fixture
}

/** Signs the browser context in as the owner, in the owner workspace (no demo marker). */
export async function signInAsOwner(context: BrowserContext): Promise<{ token: string; workspaceId: string; userId: string }> {
  const fixture = await createOwnerSession()

  await context.clearCookies()
  await context.addCookies([
    { name: E2E_SESSION_COOKIE, value: fixture.token, url: E2E_BASE_URL.replace('http://', 'https://'), httpOnly: true, secure: true, sameSite: 'Lax' },
  ])

  return fixture
}

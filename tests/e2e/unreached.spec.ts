import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { hydrated, openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.65' } })

const NO_ANSWER = 'No answer from the server. Check the connection and try again.'

/** Fails the next server action request, with a server error page or a cut connection; every other request goes on. */
async function failNextAction(page: Page, how: 'error page' | 'cut'): Promise<void> {
  let armed = true
  await page.route('**/*', async route => {
    if (!armed || !route.request().headers()['next-action']) return route.fallback()
    armed = false
    if (how === 'cut') await route.abort('failed')
    else await route.fulfill({ status: 500, body: 'Internal Server Error' })
  })
}

test.describe('a request that gets no answer', () => {
  test('an order note sent offline keeps the page and the text, and goes through once the connection is back', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders')
    await page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ }).first().click()
    const note = page.getByLabel('Internal note')
    const text = 'Courier called: the parcel waits at the depot until Friday, then goes back to us.'
    await hydrated(note)
    await note.fill(text)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(NO_ANSWER)
    await expect(page.getByRole('heading', { level: 1, name: /^Order #\d+$/ })).toBeVisible()
    await expect(note).toHaveValue(text)
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Note added.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'History' })).toContainText(text)
  })

  test('a product save answered with a server error keeps the details typed', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/products/hush')
    const details = page.getByRole('region', { name: 'Details' })
    await hydrated(details.getByLabel('Description'))
    await details.getByLabel('Description').fill('Quiet type on black, printed on matte paper.')
    await failNextAction(page, 'error page')
    await details.getByRole('button', { name: 'Save changes' }).click()
    await expect(details.getByRole('alert')).toHaveText(NO_ANSWER)
    await expect(details.getByLabel('Description')).toHaveValue('Quiet type on black, printed on matte paper.')
    await details.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Changes saved.')).toBeVisible()
  })

  test('a new collection whose request is cut keeps its name and slug', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/collections/new')
    await hydrated(page.getByLabel('Name'))
    await page.getByLabel('Name').fill('Deep Sea')
    await page.getByLabel('Slug').fill('deep-sea')
    await failNextAction(page, 'cut')
    await page.getByRole('button', { name: 'Create collection' }).click()
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(NO_ANSWER)
    await expect(page.getByLabel('Name')).toHaveValue('Deep Sea')
    await expect(page.getByLabel('Slug')).toHaveValue('deep-sea')
  })

  test('a status change that gets no answer keeps the page, puts the badge back and says so', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/orders?status=paid')
    await page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: /^Order #\d+$/ })).toBeVisible()
    await failNextAction(page, 'cut')
    await page.getByRole('button', { name: 'Change status' }).click()
    await page.getByRole('menuitem', { name: 'Processing' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText(NO_ANSWER)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: /^Order #\d+$/ })).toBeVisible()
    await expect(page.getByRole('main').getByText('Paid', { exact: true })).toBeVisible()
  })

  test('a theme switch that gets no answer keeps the page and what was typed on it', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/products/hush')
    const description = page.getByRole('region', { name: 'Details' }).getByLabel('Description')
    await hydrated(description)
    await description.fill('A draft not saved yet.')
    await failNextAction(page, 'error page')
    await page.getByRole('banner').getByRole('button', { name: /^Theme/ }).click()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText(NO_ANSWER)).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
    await expect(description).toHaveValue('A draft not saved yet.')
  })
})

import type { Locator, Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.63' } })

/** The contrast of an element's text with its own background, both read as the browser paints them. */
const ownContrast = (target: Locator) => target.evaluate(element => {
  const channels = (colour: string) => (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  const luminance = (colour: string) => {
    const [r, g, b] = channels(colour).map(c => c / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  const style = getComputedStyle(element)
  const [hi, lo] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a)
  return (hi! + 0.05) / (lo! + 0.05)
})

const box = async (target: Locator) => (await target.boundingBox())!

async function busiestCustomer(page: Page, workspaceId: string): Promise<void> {
  const { rows } = await asSchemaOwner(c => c.query<{ id: string }>(
    `select c.id from fa.customers c join fa.orders o on o.workspace_id = c.workspace_id and o.customer_id = c.id
      where c.workspace_id = $1 group by c.workspace_id, c.id order by count(o.id) desc, c.id limit 1`, [workspaceId]))
  await openFramed(page, `/customers/${rows[0]!.id}`)
}

test.describe('visual details', () => {
  test('a hovered primary button keeps its text at 4.5:1 or more in the light theme', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await openFramed(page, '/team')
    const send = page.getByRole('button', { name: 'Send invitation' })
    await send.hover()
    // The hover colour fades in (transition-all): the reading waits for the end of it.
    await expect.poll(() => send.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(163, 49, 12)')
    expect(await ownContrast(send)).toBeGreaterThanOrEqual(4.5)
  })

  test('the notes forms submit with the button every other form uses', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await openFramed(page, '/orders')
    await page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: /^#\d+$/ }).first().click()
    const addNote = page.getByRole('button', { name: 'Add note' })
    await expect(addNote).toHaveCSS('height', '32px')
    await expect(addNote).toHaveCSS('font-size', '14px')
    await busiestCustomer(page, workspaceId)
    const saveNotes = page.getByRole('button', { name: 'Save notes' })
    await expect(saveNotes).toHaveCSS('height', '32px')
    await expect(saveNotes).toHaveCSS('font-size', '14px')
  })

  test('the customer page lines its order rows up with the card title and the link beside it', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await busiestCustomer(page, workspaceId)
    const orders = page.getByRole('region', { name: 'Orders' })
    const title = await box(orders.getByRole('heading', { name: 'Orders' }))
    const header = await box(orders.getByRole('link', { name: /^Show all \d+ in Orders$/ }))
    const row = orders.getByRole('listitem').first()
    const number = await box(row.getByRole('link'))
    const amount = await box(row.getByText(/^\$[\d,.]+$/))
    expect(Math.round(number.x)).toBe(Math.round(title.x))
    expect(Math.round(amount.x + amount.width)).toBe(Math.round(header.x + header.width))
  })

  test('on a phone the revenue table keeps each day with its month, and the bell keeps 16 px from both edges', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAsSandboxUser(context)
    await openFramed(page, '/overview')
    await page.getByRole('button', { name: 'Show as table' }).first().click()
    const heads = page.getByRole('table').first().locator('thead th')
    for (const text of await heads.allTextContents()) expect(text, text).not.toMatch(/\d [A-Za-z]|[A-Za-z] \d/)

    await page.getByRole('button', { name: /^Notifications/ }).click()
    const popup = await box(page.getByRole('dialog', { name: 'Notifications' }))
    expect(popup.x).toBeGreaterThanOrEqual(16)
    expect(popup.x + popup.width).toBeLessThanOrEqual(390 - 16)
  })
})

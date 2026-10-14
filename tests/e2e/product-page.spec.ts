import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.31' } })

const details = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Details' })

test.describe('product page', () => {
  test('shows a viewer the facts, the variants and the image without a form, and passes axe', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')
    await page.goto('/products')
    await page.getByRole('table', { name: 'Products' }).getByRole('link', { name: 'Far Orbit' }).click()
    await expect(page).toHaveURL(/\/products\/far-orbit$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Far Orbit' })).toBeVisible()
    await expect(page).toHaveTitle('Far Orbit · Formline Admin')
    await expect(page.getByText(/^Night · updated /)).toBeVisible()
    await expect(details(page).getByText('Your role can view products but not change them.')).toBeVisible()
    await expect(details(page).getByRole('textbox')).toHaveCount(0)
    await expect(details(page).getByRole('definition').first()).toHaveText('far-orbit')
    const variants = page.getByRole('table', { name: 'Variants' })
    await expect(variants.getByRole('row')).toHaveCount(7)
    await expect(variants.getByRole('row').nth(1)).toContainText('A3 · Ink')
    await expect(variants.getByRole('row').nth(1)).toContainText('far-orbit-a3-ink')
    await expect(variants.getByRole('row').nth(1)).toContainText('$31.00')
    await expect(page.getByRole('region', { name: 'Image' }).locator('img')).toHaveAttribute('src', '/posters/far-orbit.webp')
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('saves the details, logs the change and shows the new name in the list', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/products/low-tide')
    await details(page).getByLabel('Name').fill('Low Tide, Revisited')
    await details(page).getByLabel('Base price, $').fill('33.5')
    await details(page).getByLabel('Tags').fill('calm, Sea Glass')
    await details(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('region', { name: 'Messages' }).getByText('Changes saved.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Low Tide, Revisited' })).toBeVisible()
    await expect(details(page).getByLabel('Base price, $')).toHaveValue('33.50')
    await expect(details(page).getByLabel('Tags')).toHaveValue('calm, sea-glass')
    await expect(page.getByRole('region', { name: 'Variants' }).getByLabel('Own price, $, A3 · Paper')).toHaveAttribute('placeholder', '33.50')
    const entries = await asSchemaOwner(async c => (await c.query<{ details: { changed: string[] } }>(
      "select details from fa.activity_log where workspace_id = $1 and action = 'product.updated'", [workspaceId])).rows)
    expect(entries.map(e => e.details.changed)).toEqual([['name', 'basePrice', 'tags']])
    await page.goto('/products?q=revisited')
    await expect(page.getByRole('table', { name: 'Products' }).getByRole('link', { name: 'Low Tide, Revisited' })).toBeVisible()
  })

  test('moves the page when the slug changes and forgets the old address', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/sparse')
    await details(page).getByLabel('Slug').fill('sparse-grid')
    await details(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(/\/products\/sparse-grid$/)
    await expect(details(page).getByLabel('Slug')).toHaveValue('sparse-grid')
    // The page streams behind its loading state, so a missing product is a 200 with the not-found page (as on the orders).
    await page.goto('/products/sparse')
    await expect(page.getByRole('heading', { name: 'Product not found' })).toBeVisible()
  })

  test('names every field problem, focuses the first and keeps what was typed', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products/hush')
    await details(page).getByLabel('Name').fill('  ')
    await details(page).getByLabel('Base price, $').fill('12,345')
    await details(page).getByLabel('Tags').fill('dark, #bold')
    await details(page).getByLabel('Collection').selectOption({ label: 'Pastel' })
    await details(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(details(page).getByText('Enter a name.')).toBeVisible()
    await expect(details(page).getByText('Enter a price from 0.01 to 9959.99. The largest size costs $40 more.')).toBeVisible()
    await expect(details(page).getByText(/^Use up to 12 tags/)).toBeVisible()
    await expect(details(page).getByLabel('Name')).toBeFocused()
    await expect(details(page).getByLabel('Name')).toHaveAttribute('aria-invalid', 'true')
    await expect(details(page).getByLabel('Base price, $')).toHaveValue('12,345')
    await expect(details(page).getByLabel('Tags')).toHaveValue('dark, #bold')
    // React resets the form after the result; the select keeps the chosen collection all the same.
    await expect(details(page).getByLabel('Collection').locator('option:checked')).toHaveText('Pastel')
    await expect(page.getByRole('heading', { level: 1, name: 'Hush' })).toBeVisible()
  })

  test('reports a change made meanwhile and loads it on request', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await page.goto('/products/loud')
    await asSchemaOwner(c => c.query("update fa.products set description = 'Changed in another tab.', updated_at = now() where workspace_id = $1 and slug = 'loud'", [workspaceId]))
    await details(page).getByLabel('Name').fill('Louder')
    await details(page).getByRole('button', { name: 'Save changes' }).click()
    const alert = details(page).getByRole('alert')
    await expect(alert).toContainText('Someone changed this product while the page was open.')
    await expect(details(page).getByLabel('Name')).toHaveValue('Louder')
    // The action sits inside the message in nearly its color: the underline is what marks it as a control.
    // The pointer still rests where Save was clicked, and the page has moved under it: away first, or a hover decides.
    await page.mouse.move(0, 0)
    await expect(alert.getByRole('button', { name: 'Load the current version' })).toHaveCSS('text-decoration-line', 'underline')
    await alert.getByRole('button', { name: 'Load the current version' }).click()
    await expect(details(page).getByLabel('Description')).toHaveValue('Changed in another tab.')
    await expect(details(page).getByLabel('Name')).toHaveValue('Loud')
    await expect(details(page).getByRole('alert')).toHaveCount(0)
  })

  test('opens from an order line and fits a phone', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const line = await asSchemaOwner(async c => (await c.query<{ number: number; name: string; slug: string }>(
      `select o.number, l.name, p.slug from fa.orders o
         join fa.order_lines l on l.workspace_id = o.workspace_id and l.order_id = o.id
         join fa.product_variants v on v.workspace_id = l.workspace_id and v.id = l.variant_id
         join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
        where o.workspace_id = $1 order by o.placed_at desc limit 1`, [workspaceId])).rows[0]!)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(`/orders/${line.number}`)
    await page.getByRole('link', { name: line.name }).click()
    await expect(page).toHaveURL(new RegExp(`/products/${line.slug}$`))
    await expect(page.getByRole('table', { name: 'Variants' })).toBeHidden()
    await expect(page.getByRole('list', { name: 'Variants' }).getByRole('listitem').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })

  test('spells the stock out on a phone, where no column header names it', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const variant = await asSchemaOwner(async c => (await c.query<{ sku: string; stock: number }>(
      `select v.sku, v.stock from fa.product_variants v
         join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
        where v.workspace_id = $1 and p.slug = 'after-dark' and v.stock > v.low_stock_threshold
        order by v.sku limit 1`, [workspaceId])).rows[0]!)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/products/after-dark')
    const item = page.getByRole('list', { name: 'Variants' }).getByRole('listitem').filter({ hasText: variant.sku })
    await expect(item).toContainText(`${variant.stock} in stock`)
  })

  test('sends the title inside the head, with the page', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    const html = await (await page.request.get('/products/after-dark')).text()
    expect(html).toContain('<title>After Dark · Formline Admin</title>')
    // Streamed behind the page, the title left the tab without one for up to 0.3 s after a refresh or a navigation.
    expect(html.indexOf('<title>')).toBeLessThan(html.indexOf('</head>'))
  })
})

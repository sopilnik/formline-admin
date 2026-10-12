import { expectNoSeriousA11yViolationsInBothThemes } from './a11y.ts'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.30' } })

const count = (sql: string, params: unknown[]) => asSchemaOwner(async c => Number((await c.query<{ n: string }>(sql, params)).rows[0]!.n))

const withSoldOut = (workspaceId: string) => count(
  "select count(*) as n from fa.products p where p.workspace_id = $1 and p.status <> 'archived' and exists (select 1 from fa.product_variants v where v.workspace_id = p.workspace_id and v.product_id = p.id and v.stock = 0)",
  [workspaceId])

test.describe('products list', () => {
  test('lists every product by name with its collection, status, price and stock, and passes axe', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'viewer')
    const total = await count('select count(*) as n from fa.products where workspace_id = $1', [workspaceId])
    await page.goto('/products')
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible()
    await expect(page).toHaveTitle('Products · Formline Admin')
    await expect(page.getByText(`${total} products`)).toBeVisible()
    const table = page.getByRole('table', { name: 'Products' })
    await expect(table.getByRole('row')).toHaveCount(total + 1)
    const first = table.getByRole('row').nth(1)
    await expect(first.getByRole('link', { name: 'After Dark' })).toHaveAttribute('href', '/products/after-dark')
    await expect(first).toContainText('Night')
    await expect(first).toContainText('Published')
    await expect(first).toContainText('$24.00')
    await expect(page.getByRole('link', { name: 'Products', exact: true })).toHaveAttribute('aria-current', 'page')
    await expectNoSeriousA11yViolationsInBothThemes(page)
  })

  test('opens the sold-out and low-stock products from the overview', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const soldOut = await withSoldOut(workspaceId)
    await page.goto('/overview')
    await page.getByRole('navigation', { name: 'Needs attention' }).getByRole('link', { name: /sold out/ }).click()
    await expect(page).toHaveURL(/\/products\?stock=out$/)
    await expect(page.getByLabel('Stock', { exact: true })).toHaveValue('out')
    const table = page.getByRole('table', { name: 'Products' })
    await expect(table.getByRole('row')).toHaveCount(soldOut + 1)
    for (const row of await table.locator('tbody tr').all()) await expect(row).toContainText('sold out')
    await expect(page.getByText(`${soldOut} of 16 products`)).toBeVisible()
    await page.goto('/overview')
    await page.getByRole('region', { name: 'Low stock' }).getByRole('link', { name: /^View all/ }).click()
    await expect(page).toHaveURL(/\/products\?stock=low$/)
    await expect(page.getByLabel('Stock', { exact: true })).toHaveValue('low')
  })

  test('filters by status, collection and name, and clears the filters', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await asSchemaOwner(c => c.query("update fa.products set status = 'draft' where workspace_id = $1 and slug = 'hush'", [workspaceId]))
    await page.goto('/products')
    const table = page.getByRole('table', { name: 'Products' })
    await page.getByRole('button', { name: 'Draft, 1' }).click()
    await expect(page).toHaveURL(/\/products\?status=draft$/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByRole('link', { name: 'Hush' })).toBeVisible()
    await page.getByRole('button', { name: 'All, 16' }).click()
    await page.getByLabel('Collection', { exact: true }).selectOption('night')
    await expect(page).toHaveURL(/\/products\?collection=night$/)
    await expect(table.getByRole('row')).toHaveCount(5)
    await page.getByRole('searchbox', { name: 'Search products' }).fill('orbit')
    await expect(page).toHaveURL(/\/products\?q=orbit&collection=night$/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByRole('link', { name: 'Far Orbit' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search products' }).fill('no such poster')
    await expect(page.getByRole('heading', { name: 'No products match these filters' })).toBeVisible()
    await page.getByRole('link', { name: 'Clear filters' }).first().click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(table.getByRole('row')).toHaveCount(17)
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toHaveValue('')
  })

  test('sorts by price through links in the headers', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    const total = await count('select count(*) as n from fa.products where workspace_id = $1', [workspaceId])
    await page.goto('/products')
    const table = page.getByRole('table', { name: 'Products' })
    await table.getByRole('link', { name: 'Price from' }).click()
    await expect(page).toHaveURL(/\/products\?sort=price$/)
    await expect(table.getByRole('columnheader', { name: 'Price from' })).toHaveAttribute('aria-sort', 'ascending')
    // The column found by its header, read once the rows are there: allTextContents does not wait.
    const prices = async () => {
      await expect(table.locator('tbody tr')).toHaveCount(total)
      const column = await table.locator('thead th').evaluateAll(cells => cells.findIndex(cell => cell.textContent?.startsWith('Price from')) + 1)
      expect(column).toBeGreaterThan(0)
      const cells = await table.locator(`tbody tr > :nth-child(${column})`).allTextContents()
      expect(cells).toHaveLength(total)
      return cells.map(text => Number(text.replace(/[^\d.]/g, '')))
    }
    const ascending = await prices()
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b))
    await table.getByRole('link', { name: 'Price from' }).click()
    await expect(page).toHaveURL(/\/products\?sort=price&dir=desc$/)
    await expect(table.getByRole('columnheader', { name: 'Price from' })).toHaveAttribute('aria-sort', 'descending')
    const descending = await prices()
    expect(descending).toEqual([...descending].sort((a, b) => b - a))
  })

  test('pages through the list, starts again at page 1 on a new filter and lands on the last page from a stale link', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await asSchemaOwner(c => c.query(
      `insert into fa.products (workspace_id, slug, name, collection_id, base_price_cents, status)
       select $1, 'zz-extra-' || lpad(n::text, 2, '0'), 'Zz Extra ' || lpad(n::text, 2, '0'),
              (select id from fa.collections where workspace_id = $1 and slug = 'night'), 2900, 'draft'
         from generate_series(1, 20) n`, [workspaceId]))
    await page.goto('/products')
    const table = page.getByRole('table', { name: 'Products' })
    const pager = page.getByRole('navigation', { name: 'Pagination' })
    await expect(table.getByRole('row')).toHaveCount(26)
    await expect(pager.getByText('1–25 of 36')).toBeVisible()
    await pager.getByRole('link', { name: 'Next page' }).click()
    await expect(page).toHaveURL(/\/products\?page=2$/)
    await expect(pager.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    await expect(table.getByRole('row')).toHaveCount(12)
    await expect(table.getByRole('row').last().getByRole('link', { name: 'Zz Extra 20' })).toBeVisible()
    await page.getByRole('button', { name: 'Draft, 20' }).click()
    await expect(page).toHaveURL(/\/products\?status=draft$/)
    await expect(table.getByRole('row')).toHaveCount(21)
    await pager.getByLabel('Products per page').selectOption('50')
    await expect(page).toHaveURL(/\/products\?status=draft&size=50$/)
    await page.goto('/products?page=999')
    await expect(page).toHaveURL(/\/products\?page=2$/)
  })

  test('shows cards on a phone without sideways scrolling', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await signInAsSandboxUser(context)
    await page.goto('/products')
    await expect(page.getByRole('table', { name: 'Products' })).toBeHidden()
    const cards = page.getByRole('list', { name: 'Products' }).getByRole('listitem')
    await expect(cards).toHaveCount(16)
    await expect(cards.first().getByRole('link', { name: 'After Dark' })).toBeVisible()
    await expect(cards.first()).toContainText('in stock')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })

  test('keeps both stock notes of a row inside the stock column in Russian', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products?lang=ru')
    const table = page.getByRole('table', { name: 'Товары' })
    const row = table.getByRole('row').filter({ hasText: 'Night Blocks' })
    await expect(row.getByText('распродано: 2')).toBeVisible()
    await expect(row.getByText('на исходе: 1')).toBeVisible()
    // The page does not overflow when a note leaves its cell, so the text itself is measured against the cell.
    const outside = await table.locator('tbody tr').evaluateAll(rows => rows.flatMap(tr => {
      const cell = tr.children[4] as HTMLElement
      const note = cell.querySelector('span')
      if (!note) return []
      const range = document.createRange()
      range.selectNodeContents(note)
      const text = range.getBoundingClientRect()
      const box = cell.getBoundingClientRect()
      return text.left < box.left || text.right > box.right ? [tr.querySelector('a')?.textContent ?? ''] : []
    }))
    expect(outside).toEqual([])
  })

  test('keeps every status badge inside the status column in Russian', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/products?lang=ru')
    const table = page.getByRole('table', { name: 'Товары' })
    await expect(table.getByText('Опубликован').first()).toBeVisible()
    // "Опубликован" is the widest badge; a badge that runs past its cell leaves no page overflow to see.
    const outside = await table.locator('tbody tr').evaluateAll(rows => rows.flatMap(tr => {
      const cell = tr.children[2] as HTMLElement
      const badge = cell.querySelector('span')!.getBoundingClientRect()
      const box = cell.getBoundingClientRect()
      return badge.left < box.left || badge.right > box.right ? [tr.querySelector('a')?.textContent ?? ''] : []
    }))
    expect(outside).toEqual([])
  })
})

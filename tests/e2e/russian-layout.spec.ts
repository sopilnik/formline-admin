import type { Page } from '@playwright/test'
import { E2E_ORIGIN_SECRET } from './constants.ts'
import { asSchemaOwner } from './db.ts'
import { openFramed } from './ready.ts'
import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.53' } })

// Long Russian names in every place a name shows (spec §11, Review Focus 5), well inside their limits.
const LONG = {
  product: 'Тихая заводь на рассвете: пастельная серия для спальни и гостиной',
  collection: 'Пастельные мотивы для спокойных светлых интерьеров',
  customer: 'Александра Константиновна Преображенская-Воскресенская',
  email: 'aleksandra.preobrazhenskaya-voskresenskaya@example.net',
  member: 'Мария-Антуанетта Преображенская-Карамзина',
  store: 'Formline — постеры и принты для дома и офиса',
}

type Fixture = { product: string; collection: string; order: number; customer: string; letter: string }

async function longNames(workspaceId: string): Promise<Fixture> {
  return asSchemaOwner(async c => {
    const product = (await c.query<{ id: string; slug: string }>('select id, slug from fa.products where workspace_id = $1 order by name limit 1', [workspaceId])).rows[0]!
    await c.query('update fa.products set name = $3 where workspace_id = $1 and id = $2', [workspaceId, product.id, LONG.product])
    await c.query("update fa.notifications set payload = jsonb_set(payload, '{product}', to_jsonb($2::text)) where workspace_id = $1 and kind = 'stock.low'", [workspaceId, LONG.product])
    const collection = (await c.query<{ id: string; slug: string }>('select id, slug from fa.collections where workspace_id = $1 order by position limit 1', [workspaceId])).rows[0]!
    await c.query('update fa.collections set name = $3 where workspace_id = $1 and id = $2', [workspaceId, collection.id, LONG.collection])
    const order = (await c.query<{ number: number; customer_id: string }>('select number, customer_id from fa.orders where workspace_id = $1 order by placed_at desc limit 1', [workspaceId])).rows[0]!
    await c.query("update fa.customers set name = $3, email = $4, city = 'Санкт-Петербург' where workspace_id = $1 and id = $2", [workspaceId, order.customer_id, LONG.customer, LONG.email])
    await c.query("update fa.users set name = $2 where workspace_id = $1 and role = 'manager'", [workspaceId, LONG.member])
    await c.query('update fa.store_settings set store_name = $2 where workspace_id = $1', [workspaceId, LONG.store])
    const letter = await c.query<{ id: string }>(
      "insert into fa.outbox_emails (workspace_id, to_address, template, payload) values ($1, $2, 'team.invitation', $3) returning id",
      [workspaceId, LONG.email, JSON.stringify({ inviter: 'Dana Ortiz', role: 'manager', token: 'x'.repeat(32), locale: 'ru' })])
    return { product: product.slug, collection: collection.slug, order: order.number, customer: order.customer_id, letter: letter.rows[0]!.id }
  })
}

const pages = (f: Fixture): string[] => [
  '/overview', '/orders', `/orders/${f.order}`, '/products', `/products/${f.product}`, '/products/new', '/collections',
  `/collections/${f.collection}`, '/collections/new', '/customers', `/customers/${f.customer}`, '/team', '/activity', '/outbox',
  `/outbox/${f.letter}`, '/notifications', '/settings/profile', '/settings/security', '/settings/store',
]

/** What a layout gets wrong: a page wider than the screen, content running past its table cell, KPI values out of line. */
async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
    if (overflow > 0) out.push(`page ${overflow}px wider than the screen`)
    for (const cell of document.querySelectorAll('th, td')) {
      const box = cell.getBoundingClientRect()
      if (box.width === 0 || [cell, ...cell.querySelectorAll('*')].some(el => getComputedStyle(el).textOverflow === 'ellipsis')) continue
      const range = document.createRange()
      range.selectNodeContents(cell)
      const content = range.getBoundingClientRect()
      if (content.width > 0 && (content.right > box.right + 1 || content.left < box.left - 1)) out.push(`cell «${(cell.textContent ?? '').trim().slice(0, 30)}» spills`)
    }
    const rows = new Map<number, number[]>()
    for (const card of document.querySelectorAll('[role="group"][aria-labelledby^="kpi-"]')) {
      const top = Math.round(card.getBoundingClientRect().top)
      rows.set(top, [...(rows.get(top) ?? []), Math.round(card.querySelector('p')!.getBoundingClientRect().top)])
    }
    for (const values of rows.values()) if (new Set(values).size > 1) out.push(`KPI values at ${values.join(', ')}`)
    return out
  })
}

test.describe('the Russian layout', () => {
  for (const [width, height] of [[375, 812], [640, 400]] as const) {
    test(`holds every page with long names at ${width} px`, async ({ page, context }) => {
      test.setTimeout(120_000)
      const { workspaceId } = await signInAsSandboxUser(context)
      const fixture = await longNames(workspaceId)
      await page.setViewportSize({ width, height })
      await page.goto('/overview?lang=ru')
      for (const path of pages(fixture)) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        expect(await problems(page), path).toEqual([])
      }
    })
  }

  test('keeps the top bar inside the screen with a long member name, which it shortens from 1024 px', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context, 'manager')
    await longNames(workspaceId)
    await page.goto('/overview?lang=ru')
    const account = page.getByRole('button', { name: `Меню аккаунта: ${LONG.member}, Менеджер` })
    for (const width of [640, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(account).toBeVisible()
      expect(await problems(page), `${width} px`).toEqual([])
      const name = account.getByText(LONG.member)
      if (width < 1024) await expect(name).toBeHidden()
      else await expect(name).toHaveCSS('text-overflow', 'ellipsis')
    }
  })

  test('puts a collection\'s product count under its name on a phone, and beside it on a wide screen', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await longNames(workspaceId)
    await page.goto('/collections?lang=ru')
    const row = page.getByRole('list', { name: 'Коллекции' }).getByRole('listitem').first()
    const name = row.getByRole('link', { name: LONG.collection })
    const count = row.getByText(/^\d+ товар/).locator('visible=true')
    // On a phone the count starts where the name starts, below its last line.
    await page.setViewportSize({ width: 375, height: 812 })
    const phoneName = (await name.boundingBox())!
    const phoneCount = (await count.boundingBox())!
    expect(Math.abs(phoneCount.x - phoneName.x)).toBeLessThanOrEqual(1)
    expect(phoneCount.y).toBeGreaterThanOrEqual(phoneName.y + phoneName.height)
    await page.setViewportSize({ width: 1280, height: 800 })
    expect((await count.boundingBox())!.x).toBeGreaterThan((await name.boundingBox())!.x + 200)
  })

  test('keeps the overlays inside a phone screen', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    await longNames(workspaceId)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/overview?lang=ru')

    const inside = async (name: string) => {
      const box = (await page.getByRole('dialog', { name }).boundingBox())!
      expect(box.x, name).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, name).toBeLessThanOrEqual(375)
      expect(await problems(page), name).toEqual([])
    }

    await page.getByRole('button', { name: /^Уведомления/ }).click()
    await inside('Уведомления')

    // The header's button keeps inside the header's padding: the Russian label is as short as the English one.
    const bell = page.getByRole('dialog', { name: 'Уведомления' })
    const markAll = bell.getByRole('button').first()
    const [popup, button] = [(await bell.boundingBox())!, (await markAll.boundingBox())!]
    expect(button.x + button.width, 'the bell header keeps its padding').toBeLessThanOrEqual(popup.x + popup.width - 16)
    await expect(markAll).toHaveText('Прочитать все')

    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+k')
    await page.keyboard.type('Преображ')
    const customer = page.getByRole('group', { name: 'Покупатели' }).getByRole('option').first()
    await expect(customer).toContainText(LONG.email)
    await inside('Поиск и команды')
    const [label, hint] = await customer.locator('span').evaluateAll(spans => spans.map(span => span.getBoundingClientRect().top))
    expect(hint!, 'the hint stands under the name').toBeGreaterThan(label!)
    await page.keyboard.press('Escape')

    await page.getByRole('region', { name: 'Демо-песочница' }).getByRole('button', { name: 'Ещё действия' }).click()
    await page.getByRole('menuitem', { name: 'Сменить пользователя' }).click()
    await inside('Сменить пользователя')
  })

  test('keeps a tall dialog inside a 640 × 400 screen and scrolls it inside', async ({ page, context }) => {
    const { workspaceId } = await signInAsSandboxUser(context)
    // Sixteen more members: "Switch user" lists nineteen.
    await asSchemaOwner(c => c.query(
      "insert into fa.users (workspace_id, email, name, role) select $1, 'member.' || g || '@formline.test', 'Участник ' || g, 'manager' from generate_series(1, 16) g",
      [workspaceId]))
    await page.setViewportSize({ width: 640, height: 400 })
    await openFramed(page, '/overview?lang=ru')
    const fits = async (name: string) => {
      const dialog = page.getByRole('dialog', { name })
      await expect(dialog).toBeVisible()
      // Measured once its opening zoom has finished.
      await dialog.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
      const box = (await dialog.boundingBox())!
      expect(box.y, name).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height, name).toBeLessThanOrEqual(400)
      return dialog
    }
    await page.getByRole('heading', { level: 1 }).click()
    await page.keyboard.press('Shift+?')
    await fits('Горячие клавиши')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Сменить пользователя' }).click()
    const dialog = await fits('Сменить пользователя')
    const cancel = dialog.getByRole('button', { name: 'Отмена' })
    await cancel.scrollIntoViewIfNeeded()
    await expect(cancel).toBeInViewport()
    await cancel.click()
    await expect(dialog).toBeHidden()
  })
})

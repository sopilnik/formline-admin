import { signInAsOwner, signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.describe('pages that are not there', () => {
  test('an unknown address offers the way back to the overview, in both languages, under its own title', async ({ page, context }) => {
    await signInAsSandboxUser(context)

    const cases = [
      { lang: 'en', title: 'Page not found · Formline Admin', link: 'Overview' },
      { lang: 'ru', title: 'Страница не найдена · Formline Admin', link: 'Обзор' },
    ]

    for (const { lang, title, link } of cases) {
      const response = await page.goto(`/no-such-page?lang=${lang}`)

      expect(response!.status()).toBe(404)
      await expect(page).toHaveTitle(title)
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.getByRole('main').getByRole('link', { name: link })).toBeVisible()
    }

    await page.getByRole('main').getByRole('link', { name: 'Обзор' }).click()

    await expect(page).toHaveURL(/\/overview$/)
  })

  test('a missing order’s tab says it is missing', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.goto('/orders/999999')

    await expect(page.getByRole('heading', { level: 1, name: 'Order not found' })).toBeVisible()
    await expect(page).toHaveTitle('Order not found · Formline Admin')
  })

  test('a page a manager may not open is titled as not found: the log, the outbox and a letter', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'manager')

    for (const path of ['/activity', '/outbox', '/outbox/0b8f6f5e-3a43-4c2a-9d7e-5f1c2a3b4c5d']) {
      await page.goto(path)

      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
      await expect(page, path).toHaveTitle('Page not found · Formline Admin')
    }
  })

  test('the owner workspace answers an invitation link as not found, and its tab says so', async ({ page, context }) => {
    await signInAsOwner(context)
    await page.goto(`/invite/${'a'.repeat(32)}`)

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page).toHaveTitle('Page not found · Formline Admin')
  })

  test('a page a viewer may not open is titled as not found, not by its name', async ({ page, context }) => {
    await signInAsSandboxUser(context, 'viewer')

    for (const path of ['/products/new', '/collections/new', '/team', '/settings/store']) {
      await page.goto(path)

      await expect(page).toHaveTitle('Page not found · Formline Admin')
    }
  })
})

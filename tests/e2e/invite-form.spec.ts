import { signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

test.describe('invitation form', () => {
  test('stacks below 1024 px, so the email field never collapses beside an open menu', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    for (const width of [768, 800, 900]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/team?lang=ru')
      const email = page.locator('#invite-email')
      await expect(email).toBeVisible()
      expect((await email.boundingBox())!.width).toBeGreaterThanOrEqual(300)
    }
  })

  test('from 1440 px the field, the role and the button stand in one row', async ({ page, context }) => {
    await signInAsSandboxUser(context)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/team')
    await expect(page.locator('#invite-email')).toBeVisible()
    const top = async (y: Promise<{ y: number } | null>) => Math.round((await y)!.y)
    const email = await top(page.locator('#invite-email').boundingBox())
    const role = await top(page.locator('#invite-role').boundingBox())
    const button = await top(page.getByRole('button', { name: 'Send invitation' }).boundingBox())
    expect(role).toBe(email)
    expect(button).toBe(email)
  })
})

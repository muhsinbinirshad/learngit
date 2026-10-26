import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const pages = ['/', '/tracks/before-you-start', '/lessons/l0-what-is-git', '/achievements', '/hub', '/settings', '/design']

for (const path of pages) {
  test(`axe: ${path} has no WCAG 2.2 A/AA violations`, async ({ page }) => {
    await page.goto(path)
    await page.waitForTimeout(800)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

test('keyboard navigation reaches the sidebar, primary action and style guide controls', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab') // skip link
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Commit Lab home' })).toBeFocused()
  // Walk until the sidebar Settings link gets focus.
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole('link', { name: 'Settings' }).evaluate((el) => el === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(page.getByRole('link', { name: 'Settings' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: /Preferences/ })).toBeVisible()
  await page.goto('/design')
  await page.getByRole('tab', { name: 'Brief', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Objectives' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Objectives' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Open dialog' }).click()
  await expect(page.getByRole('dialog', { name: 'Reset this lab?' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Reset this lab?' })).toBeHidden()
})

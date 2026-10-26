import { chromium } from '@playwright/test'
const out = '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:4173/lessons/l0-what-is-git'); await page.waitForTimeout(1000)
await page.locator('#main').evaluate((el) => el.scrollTo(0, el.scrollHeight * 0.55))
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/lesson-bottom.png` })
await browser.close()

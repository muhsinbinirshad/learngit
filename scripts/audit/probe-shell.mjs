import { chromium } from '@playwright/test'
const out = '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:4173/design'); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/design.png`, fullPage: true })
await page.goto('http://localhost:4173/settings'); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/settings.png` })
await browser.close()

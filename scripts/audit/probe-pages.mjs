import { chromium } from '@playwright/test'
const base = process.argv[2] ?? 'http://localhost:5173'
const out = '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto(`${base}/`); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/home2.png`, fullPage: true })
await page.goto(`${base}/tracks/foundations`); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/track2.png` })
await page.goto(`${base}/labs/t1-first-day`); await page.waitForTimeout(6000)
console.log('xterm present:', await page.locator('.xterm').count())
console.log(errs.length ? errs.join('\n') : 'no errors')
await browser.close()

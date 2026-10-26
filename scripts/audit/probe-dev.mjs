import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`))
await page.goto('http://localhost:5173/labs/t1-first-day')
await page.waitForTimeout(8000)
console.log(logs.filter((l) => !l.startsWith('[log]') && !l.startsWith('[debug]')).join('\n') || '(no errors)')
console.log('xterm present:', await page.locator('.xterm').count())
await browser.close()

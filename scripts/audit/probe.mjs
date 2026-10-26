import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`))
await page.goto('http://localhost:4173/labs/t1-first-day')
await page.waitForTimeout(4000)
await page.screenshot({ path: process.argv[2] ?? '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad/lab.png' })
console.log(logs.join('\n'))
console.log('BODY:', (await page.textContent('body'))?.slice(0, 600))
await browser.close()

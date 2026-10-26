import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const out = '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad'
const errors = []
const attach = (page, name) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
}
async function type(page, c) {
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.type(c)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
}
// Home + track
let page = await ctx.newPage(); attach(page, 'home')
await page.goto('http://localhost:4173/'); await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/home.png` })
await page.goto('http://localhost:4173/tracks/foundations'); await page.waitForTimeout(1000)
await page.screenshot({ path: `${out}/track.png` })
await page.close()
// Full lab 1 -> debrief
page = await ctx.newPage(); attach(page, 'lab1')
await page.goto('http://localhost:4173/labs/t1-first-day'); await page.waitForTimeout(3000)
for (const c of ['git config --global user.name "Sam Okafor"', 'git config --global user.email sam@x.io', 'git init', 'git add README.md package.json', 'git commit -m "Add docs"', 'git add src/server.js', 'git commit -m "Add HTTP server"']) await type(page, c)
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/debrief.png`, fullPage: false })
await page.close()
// Conflict lab: merge, open file in editor
page = await ctx.newPage(); attach(page, 'conflict')
await page.goto('http://localhost:4173/labs/t2-merge-conflict'); await page.waitForTimeout(3000)
await type(page, 'git merge fix/discount-cap')
await type(page, 'code src/pricing.js')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/conflict.png` })
await page.close()
// UI mode on lab 5
page = await ctx.newPage(); attach(page, 'uimode')
await page.goto('http://localhost:4173/labs/t2-feature-branch'); await page.waitForTimeout(3000)
await page.getByRole('radio', { name: 'UI' }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'New branch' }).click()
await page.getByLabel('Branch name').fill('feature/csv-export')
await page.getByRole('button', { name: 'Create and switch' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/uimode.png` })
await page.close()
console.log(errors.length ? errors.join('\n') : 'no console errors across pages')
await browser.close()

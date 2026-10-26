import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const out = '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad'
const errors = []
const attach = (page, name) => { page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`) }); page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`)) }
async function type(page, c) { await page.locator('.xterm-helper-textarea').focus(); await page.keyboard.type(c); await page.keyboard.press('Enter'); await page.waitForTimeout(600) }
const page = await ctx.newPage(); attach(page, 'resume')
await page.goto('http://localhost:4173/labs/t2-merge-shapes'); await page.waitForTimeout(3000)
await type(page, 'git merge feature/search')
await type(page, 'git log --oneline --graph --all')
const beforeReload = await page.locator('[role=img][aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
await page.reload(); await page.waitForTimeout(3500)
const afterReload = await page.locator('[role=img][aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
const term = await page.locator('.xterm-rows').textContent()
console.log('objectives before reload:', beforeReload.join(','))
console.log('objectives after reload :', afterReload.join(','))
console.log('terminal after reload   :', term.slice(0, 160))
await page.screenshot({ path: `${out}/resume.png` })
// Undo
await type(page, 'git merge feature/metrics')
await page.getByRole('button', { name: 'Undo last step' }).click(); await page.waitForTimeout(1500)
console.log('graph commits after undo:', await page.locator('[aria-label="Commit graph"] li').count())
// Reset
await page.getByRole('button', { name: 'More lab actions' }).click()
await page.getByRole('menuitem', { name: 'Reset lab' }).click()
await page.getByRole('button', { name: 'Reset lab' }).last().click(); await page.waitForTimeout(2500)
console.log('objectives after reset  :', (await page.locator('[role=img][aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(','))
console.log('graph commits after reset:', await page.locator('[aria-label="Commit graph"] li').count())
await page.screenshot({ path: `${out}/after-reset.png` })
console.log(errors.length ? errors.join('\n') : 'no console errors')
await browser.close()

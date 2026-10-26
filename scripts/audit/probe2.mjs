import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const out = '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad'
async function probe(url, cmds, name) {
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.goto(url)
  await page.waitForTimeout(3000)
  for (const c of cmds) {
    await page.locator('.xterm-helper-textarea').focus()
    await page.keyboard.type(c)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(700)
  }
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log(`== ${name}`)
  console.log(logs.join('\n') || '(no console errors)')
  const objs = await page.locator('[role=img][aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  console.log('objective markers:', objs.join(', '))
  const term = await page.locator('.xterm-rows').textContent().catch(() => 'n/a')
  console.log('terminal tail:', term?.slice(-400))
  await page.close()
}
await probe('http://localhost:4173/labs/t1-first-day', ['git config --global user.name "Sam Okafor"', 'git config --global user.email sam@x.io', 'git init', 'git add README.md package.json', 'git commit -m "Add docs"'], 't1-typed')
await probe('http://localhost:4173/labs/t2-feature-branch', [], 't2-load')
await browser.close()

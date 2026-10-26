import { chromium } from '@playwright/test'
const out = '/tmp/claude-1000/-home-muhsin-Desktop-git-learn/2dfef1f7-b70d-446c-8818-2cdcb81f97a8/scratchpad'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
for (const [path, name] of [['/hub', 'hub'], ['/settings', 'settings2'], ['/achievements', 'achievements']]) {
  await page.goto(`http://localhost:4173${path}`); await page.waitForTimeout(1000); await page.screenshot({ path: `${out}/${name}.png` })
}
await browser.close()

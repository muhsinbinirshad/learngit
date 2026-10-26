import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:4173/lessons/l0-what-is-git'); await page.waitForTimeout(1000)
const r = await page.evaluate(() => {
  const res = []
  const container = document.getElementById('main').firstElementChild
  res.push(`container ${container.tagName}.${[...container.classList].join('.')} children=${container.children.length}`)
  for (const child of [...container.children]) {
    const before = document.documentElement.scrollHeight
    child.style.display = 'none'
    const after = document.documentElement.scrollHeight
    child.style.display = ''
    res.push(`${child.tagName.toLowerCase()}.${[...child.classList].slice(0,4).join('.')} ${before}->${after}`)
  }
  // Any absolutely positioned descendants?
  const abs = [...document.querySelectorAll('#main *')].filter((el) => ['absolute', 'fixed'].includes(getComputedStyle(el).position)).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0,4).join('.')} ${getComputedStyle(el).position}`)
  res.push('positioned: ' + abs.join(' | '))
  return res
})
console.log(r.join('\n'))
await browser.close()

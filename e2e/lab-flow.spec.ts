import { test, expect, type Page } from '@playwright/test'

async function typeCommand(page: Page, cmd: string) {
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.type(cmd)
  await page.keyboard.press('Enter')
}

test.describe('Commit Lab core flow', () => {
  test('home lists tracks, track lists labs', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
    await page.getByRole('link', { name: 'Before you start track' }).click()
    await expect(page.getByRole('heading', { name: /^Before you start/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /What Git is/ }).first()).toBeVisible()
  })

  test('completes a lesson by answering its self-check', async ({ page }) => {
    await page.goto('/lessons/l0-what-is-git')
    await expect(page.getByRole('heading', { name: 'What Git is, and why it exists' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check answers' })).toBeDisabled()
    await page.getByRole('radio', { name: 'A copy of every file in the folder at that moment, plus who, when and a message' }).check()
    await page.getByRole('radio', { name: 'In a hidden .git folder inside the project' }).check()
    await page.getByRole('radio', { name: 'Seeing who changed a line and why' }).check()
    await page.getByRole('button', { name: 'Check answers' }).click()
    await expect(page.getByText('Lesson complete')).toBeVisible()
    // After the confetti the next step opens on its own.
    await expect(page.getByRole('heading', { name: 'The words you will hear every day' })).toBeVisible({ timeout: 10_000 })
  })

  test('completes the first lab from the terminal with objectives ticking', async ({ page }) => {
    await page.addInitScript(() => {
      // The prerequisite track (lessons only) must be complete before the first lab opens.
      const lessons = Object.fromEntries(
        ['l0-what-is-git', 'l0-core-words', 'l0-how-teams-work', 'l0-git-vs-hub', 'l0-ci-cd', 'l0-terminal-and-platform'].map((id) => [
          id,
          { status: 'completed', completedAt: 1 },
        ]),
      )
      localStorage.setItem('commitlab.progress', JSON.stringify({ state: { labs: {}, lessons, lastLabId: null }, version: 2 }))
    })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/labs/t1-hello-git')
    await expect(page.getByRole('heading', { name: 'Your first repository' })).toBeVisible()
    await expect(page.locator('.xterm')).toBeVisible()
    await page.waitForTimeout(500)

    await typeCommand(page, 'git config --global user.name "Sam Okafor"')
    await typeCommand(page, 'git config --global user.email sam.okafor@larkspur.health')
    await expect(page.getByRole('img', { name: 'Completed' }).first()).toBeVisible({ timeout: 10_000 })
    await typeCommand(page, 'git init')
    await typeCommand(page, 'git status')
    await expect(page.getByRole('dialog', { name: /Lab complete/ })).toBeVisible({ timeout: 15_000 })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('UI mode stages and commits and shows the equivalent command', async ({ page }) => {
    // Tracks unlock sequentially: mark Track 1 complete so Track 2's first lab is open.
    await page.addInitScript(() => {
      const lab = {
        status: 'completed',
        objectives: {},
        hintsUsed: {},
        commandsRun: 0,
        startedAt: 1,
        completedAt: 1,
        elapsedSeconds: 0,
        resets: 0,
        debriefSeen: true,
        mode: 'terminal',
      }
      const lesson = { status: 'completed', completedAt: 1 }
      const labs = Object.fromEntries(
        ['t1-hello-git', 't1-first-commit', 't1-change-and-commit', 't1-choose-what-to-save', 't1-good-messages', 't1-read-history', 't1-ignore-files'].map(
          (id) => [id, lab],
        ),
      )
      const lessons = Object.fromEntries(
        [
          'l0-what-is-git',
          'l0-core-words',
          'l0-how-teams-work',
          'l0-git-vs-hub',
          'l0-ci-cd',
          'l0-terminal-and-platform',
          'l1-three-places',
          'l1-good-messages',
          'l1-ignore-and-secrets',
          'l2-branches',
        ].map((id) => [id, lesson]),
      )
      localStorage.setItem('commitlab.progress', JSON.stringify({ state: { labs, lessons, lastLabId: null }, version: 2 }))
    })
    await page.goto('/labs/t2-feature-branch')
    await expect(page.locator('.xterm')).toBeVisible()
    await page.getByRole('radio', { name: 'UI' }).click()
    await page.getByRole('button', { name: 'New branch' }).click()
    await page.getByLabel('Branch name').fill('feature/csv-export')
    await page.getByRole('button', { name: 'Create and switch' }).click()
    await expect(page.getByText('git switch -c feature/csv-export')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Completed' }).first()).toBeVisible({ timeout: 10_000 })
  })
})

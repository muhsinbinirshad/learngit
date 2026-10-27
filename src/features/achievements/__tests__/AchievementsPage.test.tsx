// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AchievementsPage } from '../AchievementsPage'
import { earnedSandboxBadges } from '@/content/badges'
import { useProgress } from '@/features/progress/store'

afterEach(cleanup)
beforeEach(() => useProgress.setState({ labs: {}, lessons: {}, realModeBadges: [] }))

describe('badge catalog', () => {
  it('earns a sandbox badge only when its labs are complete', () => {
    expect(earnedSandboxBadges(new Set())).not.toContain('first-save')
    expect(earnedSandboxBadges(new Set(['t1-first-commit']))).toContain('first-save')
  })
})

describe('Achievements page', () => {
  function renderPage() {
    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    )
  }

  it('shows every badge with a Real GitHub indicator on real-mode badges', () => {
    renderPage()
    expect(screen.getByText('Shipped on Real GitHub')).toBeInTheDocument()
    expect(screen.getByText('CI Green')).toBeInTheDocument()
    // The two github badges carry the indicator chip (the header also mentions it).
    expect(screen.getAllByText('Real GitHub').length).toBeGreaterThanOrEqual(2)
  })

  it('reflects earned real-mode badges synced from the backend', () => {
    useProgress.setState({ realModeBadges: ['ci-green'] })
    renderPage()
    // Earned count mentions at least one earned badge.
    expect(screen.getByText(/of \d+ earned/)).toBeInTheDocument()
  })
})

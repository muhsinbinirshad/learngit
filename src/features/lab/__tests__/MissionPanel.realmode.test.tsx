// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

afterEach(cleanup)
import { MissionPanel } from '../MissionPanel'
import type { LabDefinition } from '@/engine/scenario/types'

const githubLab = {
  id: 'gh-first-pr',
  schemaVersion: 1,
  track: 't4',
  order: 1,
  title: 'Open your first pull request',
  estimatedMinutes: 20,
  difficulty: 'core',
  mode: 'github',
  realMode: {
    setup: ['Open the repository in a Codespace, or clone it locally.', 'Create a branch for your change.'],
    commands: ['git clone {{repoUrl}}', 'cd ledgerly'],
  },
  skills: ['collaboration'],
  scenario: { company: 'Ledgerly', role: 'Engineer', brief: 'Ship a change through a PR.', whyItMatters: 'PRs are how teams ship.' },
  workspace: { projectDir: 'ledgerly' },
  objectives: [{ id: 'pr', title: 'Open a pull request', check: { type: 'branchExists', name: 'x' }, hints: ['open it'] }],
  debrief: { summary: 's', internals: ['i'], keyCommands: [], commonMistakes: [], atWork: 'a' },
  solution: [],
} as unknown as LabDefinition

function renderPanel(controls: Parameters<typeof MissionPanel>[0]['realMode']) {
  return render(
    <MemoryRouter>
      <MissionPanel lab={githubLab} state={{ objectives: {} }} realMode={controls} />
    </MemoryRouter>,
  )
}

describe('MissionPanel real mode', () => {
  it('shows setup steps, the repo link, filled clone commands and an enabled check button', () => {
    const onCheck = vi.fn()
    renderPanel({ repoUrl: 'https://github.com/ledgerly-labs/gh-first-pr', checking: false, onCheck })

    expect(screen.getByText('Real GitHub lab')).toBeInTheDocument()
    expect(screen.getByText(/Create a branch for your change/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open your lab repository/ })).toHaveAttribute('href', 'https://github.com/ledgerly-labs/gh-first-pr')
    // {{repoUrl}} is interpolated into the copyable command.
    expect(screen.getByText('git clone https://github.com/ledgerly-labs/gh-first-pr')).toBeInTheDocument()

    const check = screen.getByRole('button', { name: /Check my work/ })
    expect(check).not.toBeDisabled()
    fireEvent.click(check)
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it('reports the repo is being prepared and disables the check button before provisioning', () => {
    renderPanel({ repoUrl: null, checking: false, onCheck: vi.fn() })
    expect(screen.getByText(/being prepared/i)).toBeInTheDocument()
    expect(screen.getByText('git clone <your-repo-url>')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Check my work/ })).toBeDisabled()
  })
})

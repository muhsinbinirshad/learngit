import { describe, it, expect } from 'vitest'
import { createMemoryFs } from '../../fs/memory'
import { seedLab } from '../../scenario/seed'
import { validateLabDefinition } from '../../scenario/validate'
import { SandboxProvider, GitHubProvider, createCheckProvider } from '../provider'
import type { LabDefinition, Objective } from '../../scenario/types'

const HOME = '/home/learner'

const sandboxSource = {
  id: 'provider-fixture',
  workspace: { projectDir: 'proj', identity: { name: 'Dev', email: 'dev@x.test' } },
  seed: { steps: [{ type: 'commit', message: 'init', files: { 'a.txt': 'hi\n' } }] },
} as unknown as LabDefinition

const objectives: Objective[] = [
  { id: 'file', title: 'a.txt exists', check: { type: 'fileExists', path: 'a.txt' }, hints: ['make it'] },
  { id: 'branch', title: 'feature exists', check: { type: 'branchExists', name: 'feature' }, hints: ['branch it'] },
]

describe('check providers', () => {
  it('SandboxProvider evaluates objectives against the in-browser repo', async () => {
    const fs = createMemoryFs()
    const seeded = await seedLab(fs, sandboxSource, HOME)
    const provider = new SandboxProvider({ fs, repoDir: seeded.repoDir, labels: seeded.labels })
    expect(provider.mode).toBe('sandbox')
    const results = await provider.evaluate(objectives)
    expect(results.find((r) => r.id === 'file')?.met).toBe(true)
    expect(results.find((r) => r.id === 'branch')?.met).toBe(false)
  })

  it('GitHubProvider is a Phase-5 stub that fails loudly, never a silent pass', async () => {
    const provider = new GitHubProvider({ owner: 'ledgerly-labs', repo: 'r', repoUrl: 'https://github.com/ledgerly-labs/r' })
    expect(provider.mode).toBe('github')
    await expect(provider.evaluate()).rejects.toThrow(/Phase 5/)
  })

  it('createCheckProvider builds the right provider and guards its config', () => {
    const fs = createMemoryFs()
    expect(createCheckProvider('sandbox', { ctx: { fs, repoDir: '/x', labels: {} } })).toBeInstanceOf(SandboxProvider)
    expect(createCheckProvider('github', { github: { owner: 'o', repo: 'r', repoUrl: 'u' } })).toBeInstanceOf(GitHubProvider)
    expect(() => createCheckProvider('github', {})).toThrow()
    expect(() => createCheckProvider('sandbox', {})).toThrow()
  })
})

describe('mode-aware lab validation', () => {
  const githubLab = {
    id: 'gh-lab',
    schemaVersion: 1,
    track: 't4',
    order: 1,
    title: 'Open your first pull request',
    estimatedMinutes: 20,
    difficulty: 'core',
    mode: 'github',
    realMode: { setup: ['Open the repo in Codespaces'], commands: ['git clone {{repoUrl}}'] },
    skills: ['collaboration'],
    scenario: { company: 'Ledgerly', role: 'Engineer', brief: 'Ship a small change through a pull request on GitHub.', whyItMatters: 'PRs are how teams ship.' },
    workspace: { projectDir: 'ledgerly' },
    seed: { steps: [] },
    objectives,
    debrief: { summary: 's', internals: ['i'], keyCommands: [], commonMistakes: [], atWork: 'a' },
  } as unknown as LabDefinition

  it('accepts a github lab with realMode and no sandbox solution', () => {
    expect(validateLabDefinition(githubLab)).toEqual([])
  })

  it('rejects a github lab missing realMode', () => {
    const bad = { ...githubLab, realMode: undefined }
    expect(validateLabDefinition(bad).some((e) => /realMode/.test(e))).toBe(true)
  })

  it('rejects a sandbox lab that carries realMode or omits solution', () => {
    const sandboxNoSolution = { ...githubLab, mode: 'sandbox' as const }
    const errs = validateLabDefinition(sandboxNoSolution)
    expect(errs.some((e) => /solution/.test(e))).toBe(true)
    expect(errs.some((e) => /realMode is only for github/.test(e))).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { provisionLabRepo, labRepoName } from '../github/provisioning'
import { createMemoryStore } from '../domain/memoryStore'
import { FakeGitHub } from '../github/fakeClient'
import { testConfig } from './helpers'
import type { Cohort, User } from '../domain/types'

function setup() {
  const config = testConfig()
  const client = new FakeGitHub()
  const store = createMemoryStore()
  client.registerTemplate(config.templateOwner, config.templateRepo, { 'README.md': '# Ledgerly\n', 'package.json': '{}\n' })
  const user: User = { id: 'u1', githubLogin: 'octo-learner', githubUserId: 42, role: 'learner', createdAt: 'now' }
  const cohort: Cohort = { id: 'c1', slug: 'fall25', name: 'Fall 2025', instructorId: 'i1', createdAt: 'now', archiveAfterDays: 30 }
  return { config, client, store, user, cohort }
}

describe('repo provisioning', () => {
  it('names the repo {cohort}-{lab}-{username}, sanitized', () => {
    expect(labRepoName('fall25', 't3-first-pr', 'Octo.Learner')).toBe('fall25-t3-first-pr-octo.learner')
    expect(labRepoName('fall25', 'lab', 'weird name!')).toBe('fall25-lab-weird-name-')
  })

  it('provisions from the template, adds the learner as a write collaborator only, and records the attempt', async () => {
    const { config, client, store, user, cohort } = setup()
    const attempt = await provisionLabRepo({ client, store, config }, { user, cohort, spec: { labId: 't3-first-pr' } })

    expect(attempt.status).toBe('in_progress')
    expect(attempt.repo).toEqual({ owner: 'ledgerly-labs', name: 'fall25-t3-first-pr-octo-learner', htmlUrl: 'https://github.com/ledgerly-labs/fall25-t3-first-pr-octo-learner' })
    const add = client.calls.find((c) => c.op === 'addCollaborator')
    expect(add?.detail).toMatchObject({ username: 'octo-learner', permission: 'push' })
    expect(add?.detail.permission).not.toBe('admin')
  })

  it('applies lab-specific setup: branch protection, seeded issue and seeded PR', async () => {
    const { config, client, store, user, cohort } = setup()
    const attempt = await provisionLabRepo(
      { client, store, config },
      {
        user,
        cohort,
        spec: {
          labId: 't3-first-pr',
          branchProtection: { branch: 'main', requiredApprovingReviews: 1 },
          issues: [{ title: 'Fix the README typo', body: 'There is a typo in the intro.' }],
          seededPRs: [{ branch: 'chore/ci', path: '.github/workflows/ci.yml', content: 'name: CI\n', message: 'ci: add workflow', title: 'Add CI', body: 'Sets up CI', botLogin: 'ledgerly-labs[bot]' }],
        },
      },
    )
    const name = attempt.repo!.name
    const protection = await client.getBranchProtection({ owner: 'ledgerly-labs', repo: name, branch: 'main' })
    expect(protection).toMatchObject({ requirePullRequest: true, requiredApprovingReviews: 1 })
    const issue = await client.getIssue({ owner: 'ledgerly-labs', repo: name, number: 1 })
    expect(issue?.title).toBe('Fix the README typo')
    const prs = await client.listPullRequests({ owner: 'ledgerly-labs', repo: name })
    expect(prs.map((p) => p.head)).toContain('chore/ci')
  })
})

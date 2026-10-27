import { describe, it, expect } from 'vitest'
import { FakeGitHub } from '../github/fakeClient'
import { createMemoryStore } from '../domain/memoryStore'
import { provisionLabRepo } from '../github/provisioning'
import { archiveInactiveInCohort, bulkCleanupCohort, markValidated } from '../lifecycle'
import { testConfig } from './helpers'
import type { Cohort, User } from '../domain/types'

async function provisionOne(archiveAfterDays = 14) {
  const config = testConfig()
  const client = new FakeGitHub()
  const store = createMemoryStore()
  client.registerTemplate(config.templateOwner, config.templateRepo, { 'README.md': '# Ledgerly\n' })
  const user: User = { id: 'u1', githubLogin: 'octo', githubUserId: 1, role: 'learner', createdAt: 'now' }
  const cohort: Cohort = { id: 'c1', slug: 'fall25', name: 'Fall', instructorId: 'i1', createdAt: 'now', archiveAfterDays }
  await store.createCohort(cohort)
  const attempt = await provisionLabRepo({ client, store, config }, { user, cohort, spec: { labId: 't3-first-pr' } })
  return { config, client, store, cohort, attempt, deps: { client, store, config } }
}

describe('repo lifecycle', () => {
  it('archives repos inactive past the cohort threshold, and leaves active ones', async () => {
    const { client, store, cohort, attempt, deps } = await provisionOne(14)
    // Make it look 30 days idle.
    await store.updateAttempt(attempt.id, { lastActivityAt: new Date(Date.now() - 30 * 86_400_000).toISOString() })
    const n = await archiveInactiveInCohort(deps, cohort.id)
    expect(n).toBe(1)
    expect(client.getRepoMeta(attempt.repo!.owner, attempt.repo!.name).archived).toBe(true)
    expect((await store.getAttempt(attempt.id))!.status).toBe('archived')
  })

  it('markValidated records completion and progress', async () => {
    const { store, attempt, deps } = await provisionOne()
    const validated = await markValidated(deps, attempt)
    expect(validated.status).toBe('validated')
    expect((await store.getProgress('u1')).find((p) => p.labId === 't3-first-pr')?.completedAt).toBeTruthy()
  })

  it('bulk cleanup archives every repo in a cohort', async () => {
    const { client, cohort, attempt, deps } = await provisionOne()
    const n = await bulkCleanupCohort(deps, cohort.id, 'i1')
    expect(n).toBe(1)
    expect(client.getRepoMeta(attempt.repo!.owner, attempt.repo!.name).archived).toBe(true)
  })
})

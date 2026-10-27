import { describe, it, expect } from 'vitest'
import { FakeGitHub } from '../github/fakeClient'
import { createMemoryStore } from '../domain/memoryStore'
import { BotEngine } from '../bots/engine'
import { LabRunner } from '../runner'
import { provisionLabRepo } from '../github/provisioning'
import { testConfig, signWebhook } from './helpers'
import type { Cohort, User } from '../domain/types'

async function setup() {
  const config = testConfig()
  const client = new FakeGitHub()
  const store = createMemoryStore()
  client.registerTemplate(config.templateOwner, config.templateRepo, { 'README.md': '# Ledgerly\n' })
  const runner = new LabRunner({ client, store, config, bots: new BotEngine([], store) })
  const user: User = { id: 'u1', githubLogin: 'octo', githubUserId: 1, role: 'learner', createdAt: 'now' }
  await store.upsertUser(user)
  const cohort: Cohort = { id: 'c1', slug: 'fall25', name: 'Fall', instructorId: 'i1', createdAt: 'now', archiveAfterDays: 30 }
  await store.createCohort(cohort)
  const attempt = await provisionLabRepo({ client, store, config }, { user, cohort, spec: { labId: 't3-first-pr' } })
  const repository = { name: attempt.repo!.name, owner: { login: config.classroomOrg } }
  const deliver = (event: string, payload: Record<string, unknown>, id: string) => {
    const rawBody = JSON.stringify({ ...payload, repository })
    return runner.handleWebhook({ headers: { 'x-hub-signature-256': signWebhook(config.githubWebhookSecret, rawBody), 'x-github-event': event, 'x-github-delivery': id }, rawBody })
  }
  return { store, runner, deliver }
}

describe('Real-mode badges', () => {
  it('awards "Shipped on Real GitHub" on the first merged PR, and not before', async () => {
    const { store, deliver } = await setup()
    await deliver('pull_request', { action: 'opened', pull_request: { number: 1, merged: false } }, 'd1')
    expect((await store.listBadges('u1')).map((b) => b.badgeId)).not.toContain('shipped-real-github')

    await deliver('pull_request', { action: 'closed', pull_request: { number: 1, merged: true } }, 'd2')
    const badges = await store.listBadges('u1')
    expect(badges.map((b) => b.badgeId)).toContain('shipped-real-github')
    expect(badges.find((b) => b.badgeId === 'shipped-real-github')?.source).toBe('github')
  })

  it('awards "CI Green" only after a failing check turns green', async () => {
    const { store, deliver } = await setup()
    // A success with no prior failure earns nothing.
    await deliver('check_run', { action: 'completed', check_run: { conclusion: 'success' } }, 'c1')
    expect((await store.listBadges('u1')).map((b) => b.badgeId)).not.toContain('ci-green')

    await deliver('check_run', { action: 'completed', check_run: { conclusion: 'failure' } }, 'c2')
    await deliver('check_run', { action: 'completed', check_run: { conclusion: 'success' } }, 'c3')
    expect((await store.listBadges('u1')).map((b) => b.badgeId)).toContain('ci-green')
  })

  it('badge awards are idempotent across replayed-but-distinct deliveries', async () => {
    const { store, deliver } = await setup()
    await deliver('pull_request', { action: 'closed', pull_request: { number: 1, merged: true } }, 'd1')
    await deliver('pull_request', { action: 'closed', pull_request: { number: 1, merged: true } }, 'd2')
    expect((await store.listBadges('u1')).filter((b) => b.badgeId === 'shipped-real-github')).toHaveLength(1)
  })
})

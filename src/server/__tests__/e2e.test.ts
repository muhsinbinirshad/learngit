import { describe, it, expect } from 'vitest'
import { FakeGitHub } from '../github/fakeClient'
import { createMemoryStore } from '../domain/memoryStore'
import { BotEngine } from '../bots/engine'
import { reviewFirstPR } from '../bots/scenarios'
import { LabRunner } from '../runner'
import { testConfig, signWebhook } from './helpers'
import type { Cohort } from '../domain/types'

/**
 * The Phase-5 acceptance flow, end to end against the in-memory GitHub:
 * a learner signs in → a lab repo is provisioned → the learner pushes from their terminal →
 * opens a PR → a bot reacts → the learner addresses it and the lab validates.
 */
describe('Real-mode end to end', () => {
  it('sign in → provision → push → PR → bot reacts → validate', async () => {
    const config = testConfig()
    const client = new FakeGitHub()
    const store = createMemoryStore()
    client.registerTemplate(config.templateOwner, config.templateRepo, { 'README.md': '# Ledgerly\n\nInvocing for small teams.\n', 'package.json': '{}\n' })
    const runner = new LabRunner({ client, store, config, bots: new BotEngine([reviewFirstPR], store) })

    const ORG = config.classroomOrg
    const deliver = async (event: string, payload: Record<string, unknown>, id: string) => {
      const rawBody = JSON.stringify(payload)
      return runner.handleWebhook({
        headers: { 'x-hub-signature-256': signWebhook(config.githubWebhookSecret, rawBody), 'x-github-event': event, 'x-github-delivery': id },
        rawBody,
      })
    }

    // 1) Sign in with GitHub.
    client.registerOAuthCode('code123', { login: 'octo-learner', id: 42 })
    const { state } = runner.startSignIn()
    const user = await runner.completeSignIn({ code: 'code123', state })
    expect(user.githubLogin).toBe('octo-learner')

    // 2) Cohort + provision the lab repo.
    const cohort: Cohort = { id: 'c1', slug: 'fall25', name: 'Fall 2025', instructorId: 'i1', createdAt: new Date().toISOString(), archiveAfterDays: 30 }
    await store.createCohort(cohort)
    const attempt = await runner.provision({
      userId: user.id,
      cohortId: cohort.id,
      spec: { labId: 't3-first-pr', branchProtection: { branch: 'main', requiredApprovingReviews: 1 }, issues: [{ title: 'Fix the README typo', body: '"Invocing" should be "Invoicing".' }] },
    })
    const REPO = attempt.repo!.name
    expect(REPO).toBe('fall25-t3-first-pr-octo-learner')
    expect(attempt.status).toBe('in_progress')
    const repository = { name: REPO, owner: { login: ORG } }

    // 3) Learner pushes a fix branch from their own terminal.
    client.simulatePush({ owner: ORG, repo: REPO, branch: 'fix/readme-typo', message: 'fix: correct typo in README', authorLogin: 'octo-learner', files: { 'README.md': '# Ledgerly\n\nInvoicing for small teams.\n' } })
    const afterPush = await deliver('push', { ref: 'refs/heads/fix/readme-typo', forced: false, repository }, 'd-push')
    expect(afterPush.status).toBe('ok')
    expect(afterPush.revalidated!.objectives).toMatchObject({ branch: true, commit: true, 'pr-open': false, 'pr-approved': false })
    expect(afterPush.revalidated!.status).toBe('in_progress')

    // 4) Learner opens a pull request that references the ticket.
    const pr = await client.createPullRequest({ owner: ORG, repo: REPO, head: 'fix/readme-typo', base: 'main', title: 'Fix README typo', body: 'Closes #1', authorLogin: 'octo-learner' })
    const afterOpen = await deliver('pull_request', { action: 'opened', pull_request: { number: pr.number, head: { ref: 'fix/readme-typo' } }, repository }, 'd-pr')

    // 5) A bot teammate reacts to the PR.
    expect(afterOpen.firedBots).toContain('review-first-pr')
    const reviews = await client.listReviews({ owner: ORG, repo: REPO, number: pr.number })
    expect(reviews[0]!.state).toBe('CHANGES_REQUESTED')
    expect(reviews[0]!.body).toContain('Mira Shah')
    expect(afterOpen.revalidated!.objectives).toMatchObject({ 'pr-open': true, 'pr-issue': true, 'pr-approved': false })
    expect(afterOpen.revalidated!.status).toBe('in_progress')

    // 6) Learner addresses the feedback; the teammate approves; the lab validates.
    await client.createReview({ owner: ORG, repo: REPO, number: pr.number, user: 'mira-shah', event: 'APPROVE', body: 'Looks great now — thanks!' })
    const afterApproval = await deliver('pull_request_review', { action: 'submitted', pull_request: { number: pr.number }, repository }, 'd-review')

    expect(afterApproval.revalidated!.status).toBe('validated')
    expect(Object.values(afterApproval.revalidated!.objectives).every(Boolean)).toBe(true)

    // Progress recorded for the learner.
    const progress = await store.getProgress(user.id)
    expect(progress.find((p) => p.labId === 't3-first-pr')?.completedAt).toBeTruthy()
  })

  it('replayed webhook deliveries are ignored (idempotent)', async () => {
    const config = testConfig()
    const client = new FakeGitHub()
    const store = createMemoryStore()
    client.registerTemplate(config.templateOwner, config.templateRepo, { 'README.md': '# Ledgerly\n' })
    const runner = new LabRunner({ client, store, config, bots: new BotEngine([], store) })
    const body = JSON.stringify({ ref: 'refs/heads/x', repository: { name: 'r', owner: { login: config.classroomOrg } } })
    const headers = { 'x-hub-signature-256': signWebhook(config.githubWebhookSecret, body), 'x-github-event': 'push', 'x-github-delivery': 'same-id' }
    expect((await runner.handleWebhook({ headers, rawBody: body })).status).toBe('ok')
    expect((await runner.handleWebhook({ headers, rawBody: body })).status).toBe('duplicate')
  })
})

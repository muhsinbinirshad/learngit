import { describe, it, expect } from 'vitest'
import { FakeGitHub } from '../github/fakeClient'
import { createMemoryStore } from '../domain/memoryStore'
import { BotEngine } from '../bots/engine'
import { reviewFirstPR, conflictingCommitOnMain } from '../bots/scenarios'

const OWNER = 'ledgerly-labs'
const REPO = 'fall25-lab-octo'

async function repo() {
  const client = new FakeGitHub()
  client.registerTemplate(OWNER, 'tpl', { 'README.md': '# Ledgerly\n' })
  await client.createRepoFromTemplate({ templateOwner: OWNER, templateRepo: 'tpl', owner: OWNER, name: REPO, private: true })
  return client
}
const repository = { name: REPO, owner: { login: OWNER } }

describe('bot teammates', () => {
  it('Mira requests changes when the learner opens a PR', async () => {
    const client = await repo()
    client.simulatePush({ owner: OWNER, repo: REPO, branch: 'fix', message: 'fix: typo', authorLogin: 'octo', files: { 'README.md': '# Ledgerly fixed\n' } })
    const pr = await client.createPullRequest({ owner: OWNER, repo: REPO, head: 'fix', base: 'main', title: 'Fix', body: 'Closes #1', authorLogin: 'octo' })

    const engine = new BotEngine([reviewFirstPR], createMemoryStore())
    const fired = await engine.handle({ client }, { event: 'pull_request', deliveryId: 'd1', payload: { action: 'opened', pull_request: { number: pr.number }, repository } })

    expect(fired).toEqual(['review-first-pr'])
    const reviews = await client.listReviews({ owner: OWNER, repo: REPO, number: pr.number })
    expect(reviews).toHaveLength(1)
    expect(reviews[0]!.state).toBe('CHANGES_REQUESTED')
    expect(reviews[0]!.body).toContain('Mira Shah') // attributed to a named teammate
  })

  it('Luca lands a conflicting commit on main while a feature branch is pushed', async () => {
    const client = await repo()
    const mainBefore = client.tip(OWNER, REPO, 'main')
    const engine = new BotEngine([conflictingCommitOnMain], createMemoryStore())

    const fired = await engine.handle({ client }, { event: 'push', deliveryId: 'd2', payload: { ref: 'refs/heads/feature/x', repository } })
    expect(fired).toEqual(['conflicting-commit-on-main'])
    expect(client.tip(OWNER, REPO, 'main')).not.toBe(mainBefore) // main moved

    // A push to main itself does not trigger the bot (no self-reaction loop).
    const mainNow = client.tip(OWNER, REPO, 'main')
    await engine.handle({ client }, { event: 'push', deliveryId: 'd3', payload: { ref: 'refs/heads/main', repository } })
    expect(client.tip(OWNER, REPO, 'main')).toBe(mainNow)
  })
})

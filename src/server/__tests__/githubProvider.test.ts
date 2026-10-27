import { describe, it, expect } from 'vitest'
import { FakeGitHub } from '../github/fakeClient'
import { evaluateGitHubCheck, GitHubProvider, type GitHubCheck, type GitHubCheckContext } from '../validator/githubChecks'

const OWNER = 'ledgerly-labs'
const REPO = 'fall25-lab-octo'

async function setup() {
  const client = new FakeGitHub()
  client.registerTemplate(OWNER, 'tpl', { 'README.md': '# Ledgerly\n' })
  await client.createRepoFromTemplate({ templateOwner: OWNER, templateRepo: 'tpl', owner: OWNER, name: REPO, private: true })
  return client
}
const ctx = (client: FakeGitHub, extra: Partial<GitHubCheckContext> = {}): GitHubCheckContext => ({ client, owner: OWNER, repo: REPO, ...extra })

async function met(client: FakeGitHub, check: GitHubCheck, extra?: Partial<GitHubCheckContext>): Promise<boolean> {
  try {
    await evaluateGitHubCheck(ctx(client, extra), check)
    return true
  } catch {
    return false
  }
}

describe('GitHub checks', () => {
  it('branchExists / commitOnBranch / fileContentOnBranch', async () => {
    const c = await setup()
    c.simulatePush({ owner: OWNER, repo: REPO, branch: 'fix/typo', message: 'fix: correct README typo', authorLogin: 'octo', files: { 'README.md': '# Ledgerly\n\nFixed.\n' } })
    expect(await met(c, { type: 'branchExists', branch: 'fix/typo' })).toBe(true)
    expect(await met(c, { type: 'branchExists', branch: 'nope' })).toBe(false)
    expect(await met(c, { type: 'commitOnBranch', branch: 'fix/typo', messagePattern: '^fix' })).toBe(true)
    expect(await met(c, { type: 'commitOnBranch', branch: 'fix/typo', messagePattern: '^feat' })).toBe(false)
    expect(await met(c, { type: 'fileContentOnBranch', branch: 'fix/typo', path: 'README.md', pattern: 'Fixed' })).toBe(true)
  })

  it('noSecretInHistory passes when clean, fails when a secret is in history', async () => {
    const c = await setup()
    c.simulatePush({ owner: OWNER, repo: REPO, branch: 'leak', message: 'add key', authorLogin: 'octo', files: { 'config.ts': "const k = 'sk_live_FAKE_123'\n" } })
    c.simulatePush({ owner: OWNER, repo: REPO, branch: 'leak', message: 'remove key', authorLogin: 'octo', files: { 'config.ts': 'const k = process.env.K\n' } })
    expect(await met(c, { type: 'noSecretInHistory', branch: 'leak', pattern: 'sk_live_' })).toBe(false) // still in history
    expect(await met(c, { type: 'noSecretInHistory', branch: 'main', pattern: 'sk_live_' })).toBe(true)
  })

  it('pull-request checks: open, references issue, approved, merged, merge method', async () => {
    const c = await setup()
    c.simulatePush({ owner: OWNER, repo: REPO, branch: 'feat', message: 'feat: x', authorLogin: 'octo', files: { 'a.ts': 'x' } })
    await c.createPullRequest({ owner: OWNER, repo: REPO, head: 'feat', base: 'main', title: 'Add x', body: 'Closes #1', authorLogin: 'octo' })
    expect(await met(c, { type: 'prOpen', head: 'feat' })).toBe(true)
    expect(await met(c, { type: 'prReferencesIssue', head: 'feat', issue: 1 })).toBe(true)
    expect(await met(c, { type: 'prReferencesIssue', head: 'feat', issue: 2 })).toBe(false)
    expect(await met(c, { type: 'prHasApprovedReview', head: 'feat' })).toBe(false)
    await c.createReview({ owner: OWNER, repo: REPO, number: 1, user: 'mira', event: 'APPROVE', body: 'lgtm' })
    expect(await met(c, { type: 'prHasApprovedReview', head: 'feat' })).toBe(true)
    expect(await met(c, { type: 'prMerged', head: 'feat' })).toBe(false)
    c.mergePullRequest(OWNER, REPO, 1, 'squash')
    expect(await met(c, { type: 'prMerged', head: 'feat' })).toBe(true)
    expect(await met(c, { type: 'prMergeMethod', head: 'feat', method: 'squash' })).toBe(true)
    expect(await met(c, { type: 'prMergeMethod', head: 'feat', method: 'merge' })).toBe(false)
  })

  it('issueClosed / checkRunPassed / branchProtectionEnabled / tagExists / releaseExists', async () => {
    const c = await setup()
    await c.createIssue({ owner: OWNER, repo: REPO, title: 'bug', body: 'x' })
    expect(await met(c, { type: 'issueClosed', issue: 1 })).toBe(false)
    c.closeIssue(OWNER, REPO, 1)
    expect(await met(c, { type: 'issueClosed', issue: 1 })).toBe(true)

    const sha = c.tip(OWNER, REPO, 'main')!
    c.addCheckRun(OWNER, REPO, { name: 'CI / build', conclusion: 'success', headSha: sha })
    expect(await met(c, { type: 'checkRunPassed', ref: 'refs/heads/main', name: 'CI' })).toBe(true)
    expect(await met(c, { type: 'checkRunPassed', ref: 'refs/heads/main', name: 'deploy' })).toBe(false)

    expect(await met(c, { type: 'branchProtectionEnabled', branch: 'main' })).toBe(false)
    await c.setBranchProtection({ owner: OWNER, repo: REPO, branch: 'main', requirePullRequest: true, requiredApprovingReviews: 1, requireStatusChecks: [] })
    expect(await met(c, { type: 'branchProtectionEnabled', branch: 'main', minApprovals: 1 })).toBe(true)
    expect(await met(c, { type: 'branchProtectionEnabled', branch: 'main', minApprovals: 2 })).toBe(false)

    c.addTag(OWNER, REPO, 'v1.0.0')
    expect(await met(c, { type: 'tagExists', tag: 'v1.0.0' })).toBe(true)
    expect(await met(c, { type: 'tagExists', tag: 'v9.9.9' })).toBe(false)
    c.addRelease(OWNER, REPO, { tagName: 'v1.0.0', name: 'v1', draft: false })
    expect(await met(c, { type: 'releaseExists', tag: 'v1.0.0' })).toBe(true)
  })

  it('forcePushUsedWithLease reads recorded push events', async () => {
    const c = await setup()
    expect(await met(c, { type: 'forcePushUsedWithLease', branch: 'feat' }, { pushEvents: [{ branch: 'feat', forced: true, withLease: true }] })).toBe(true)
    expect(await met(c, { type: 'forcePushUsedWithLease', branch: 'feat' }, { pushEvents: [{ branch: 'feat', forced: true, withLease: false }] })).toBe(false)
  })

  it('GitHubProvider aggregates objective results', async () => {
    const c = await setup()
    c.simulatePush({ owner: OWNER, repo: REPO, branch: 'feat', message: 'feat: x', authorLogin: 'octo', files: { 'a.ts': 'x' } })
    const provider = new GitHubProvider(ctx(c))
    const results = await provider.evaluate([
      { id: 'a', title: 'branch', check: { type: 'branchExists', branch: 'feat' } },
      { id: 'b', title: 'pr', check: { type: 'prOpen', head: 'feat' } },
    ])
    expect(results).toEqual([
      { id: 'a', met: true },
      { id: 'b', met: false, reason: expect.stringContaining('no open PR') },
    ])
  })
})

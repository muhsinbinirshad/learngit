import { describe, it, expect } from 'vitest'
import { FakeGitHub } from '../github/fakeClient'
import { GitHubProvider, type PushEvent } from '../validator/githubChecks'
import { getRealModeLab } from '../realmode/labs'

const OWNER = 'ledgerly-labs'

async function freshRepo(name: string) {
  const client = new FakeGitHub()
  client.registerTemplate(OWNER, 'tpl', { 'README.md': '# Ledgerly\n' })
  await client.createRepoFromTemplate({ templateOwner: OWNER, templateRepo: 'tpl', owner: OWNER, name, private: true })
  return client
}
function lab(id: string) {
  const l = getRealModeLab(id)
  if (!l) throw new Error(`no lab ${id}`)
  return l
}
async function evaluate(client: FakeGitHub, repo: string, id: string, pushEvents?: PushEvent[]) {
  const provider = new GitHubProvider({ client, owner: OWNER, repo, pushEvents })
  return provider.evaluate(lab(id).objectives)
}
const allMet = (rs: { met: boolean }[]) => rs.every((r) => r.met)

describe('t6-release validates against GitHub state', () => {
  it('passes when the tag and a published release exist', async () => {
    const c = await freshRepo('rel')
    c.addTag(OWNER, 'rel', 'v1.5.0')
    c.addRelease(OWNER, 'rel', { tagName: 'v1.5.0', name: '1.5.0', draft: false })
    expect(allMet(await evaluate(c, 'rel', 't6-release'))).toBe(true)
  })
  it('fails when the release is missing', async () => {
    const c = await freshRepo('rel2')
    c.addTag(OWNER, 'rel2', 'v1.5.0') // tag only, no release
    const rs = await evaluate(c, 'rel2', 't6-release')
    expect(allMet(rs)).toBe(false)
    expect(rs.find((r) => r.id === 'release')?.met).toBe(false)
  })
})

describe('t6-branch-protection validates against GitHub state', () => {
  async function arrange(withCi: boolean) {
    const c = await freshRepo('bp')
    c.simulatePush({ owner: OWNER, repo: 'bp', branch: 'fix/ci', message: 'fix: correct the thing', authorLogin: 'octo', files: { 'a.ts': 'x' } })
    const pr = await c.createPullRequest({ owner: OWNER, repo: 'bp', head: 'fix/ci', base: 'main', title: 'Fix', body: '', authorLogin: 'octo' })
    await c.setBranchProtection({ owner: OWNER, repo: 'bp', branch: 'main', requirePullRequest: true, requiredApprovingReviews: 1, requireStatusChecks: ['CI'] })
    await c.createReview({ owner: OWNER, repo: 'bp', number: pr.number, user: 'mira', event: 'APPROVE', body: 'lgtm' })
    if (withCi) c.addCheckRun(OWNER, 'bp', { name: 'CI', conclusion: 'success', headSha: c.tip(OWNER, 'bp', 'fix/ci')! })
    c.mergePullRequest(OWNER, 'bp', pr.number, 'squash')
    return c
  }
  it('passes when protection, CI, approval and merge are all in place', async () => {
    expect(allMet(await evaluate(await arrange(true), 'bp', 't6-branch-protection'))).toBe(true)
  })
  it('fails when CI is not green', async () => {
    const rs = await evaluate(await arrange(false), 'bp', 't6-branch-protection')
    expect(allMet(rs)).toBe(false)
    expect(rs.find((r) => r.id === 'ci-green')?.met).toBe(false)
  })
})

describe('t6-codeowners validates against GitHub state', () => {
  async function arrange(approve: boolean) {
    const c = await freshRepo('co')
    c.simulatePush({ owner: OWNER, repo: 'co', branch: 'feat/pricing', message: 'feat: pricing', authorLogin: 'octo', files: { 'src/pricing.ts': 'x' } })
    const pr = await c.createPullRequest({ owner: OWNER, repo: 'co', head: 'feat/pricing', base: 'main', title: 'Pricing', body: '', authorLogin: 'octo' })
    if (approve) await c.createReview({ owner: OWNER, repo: 'co', number: pr.number, user: 'ada', event: 'APPROVE', body: 'owner approves' })
    c.mergePullRequest(OWNER, 'co', pr.number, 'merge')
    return c
  }
  it('passes when a code owner approved and it merged', async () => {
    expect(allMet(await evaluate(await arrange(true), 'co', 't6-codeowners'))).toBe(true)
  })
  it('fails when there is no approving review', async () => {
    const rs = await evaluate(await arrange(false), 'co', 't6-codeowners')
    expect(allMet(rs)).toBe(false)
    expect(rs.find((r) => r.id === 'approved')?.met).toBe(false)
  })
})

describe('t5-leaked-key validates against GitHub state', () => {
  const leased: PushEvent[] = [{ branch: 'main', forced: true, withLease: true }]
  it('passes when history is clean and main was force-pushed with a lease', async () => {
    const c = await freshRepo('leak-ok') // template has no secret in history
    expect(allMet(await evaluate(c, 'leak-ok', 't5-leaked-key', leased))).toBe(true)
  })
  it('fails when the secret is still in history', async () => {
    const c = await freshRepo('leak-bad')
    c.simulatePush({ owner: OWNER, repo: 'leak-bad', branch: 'main', message: 'add key', authorLogin: 'octo', files: { 'api/src/config.ts': "const k = 'sk_live_FAKE_123'\n" } })
    const rs = await evaluate(c, 'leak-bad', 't5-leaked-key', leased)
    expect(allMet(rs)).toBe(false)
    expect(rs.find((r) => r.id === 'purged')?.met).toBe(false)
  })
  it('fails when the push was not force-with-lease', async () => {
    const c = await freshRepo('leak-noforce')
    const rs = await evaluate(c, 'leak-noforce', 't5-leaked-key', [{ branch: 'main', forced: true, withLease: false }])
    expect(rs.find((r) => r.id === 'force-lease')?.met).toBe(false)
  })
})

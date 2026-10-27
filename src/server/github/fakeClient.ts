import { createHash } from 'node:crypto'
import type { GitHubClient } from './client'
import type { BranchProtection, CheckRun, Commit, GitHubUser, Issue, OAuthTokens, PullRequest, Ref, Release, Repo, Review } from './types'

interface RepoState {
  meta: Repo
  /** branch/tag name (short) -> tip sha */
  refs: Map<string, { kind: 'branch' | 'tag'; sha: string }>
  commits: Map<string, Commit>
  issues: Issue[]
  prs: PullRequest[]
  reviews: Map<number, Review[]>
  comments: Map<number, { user: string; body: string }[]>
  checkRuns: CheckRun[]
  releases: Release[]
  protection: Map<string, BranchProtection>
  collaborators: Map<string, 'pull' | 'push' | 'admin'>
}

function sha(parts: string[]): string {
  return createHash('sha1').update(parts.join('\0')).digest('hex')
}

/**
 * In-memory GitHub for tests. Implements GitHubClient plus simulation helpers that stand in for
 * things a real learner/runner would do out-of-band (register a template, push a branch, add a
 * check run). Deterministic: shas are content hashes.
 */
export class FakeGitHub implements GitHubClient {
  private repos = new Map<string, RepoState>()
  private templates = new Map<string, { files: Record<string, string>; defaultBranch: string }>()
  private oauthCodes = new Map<string, { tokens: OAuthTokens; user: GitHubUser }>()
  /** Record of write calls, so tests can assert what the App did (e.g. bot comments). */
  readonly calls: { op: string; detail: Record<string, unknown> }[] = []

  private key(owner: string, repo: string) {
    return `${owner}/${repo}`
  }
  private repo(owner: string, repoName: string): RepoState {
    const r = this.repos.get(this.key(owner, repoName))
    if (!r) throw new Error(`no such repo ${owner}/${repoName}`)
    return r
  }
  private record(op: string, detail: Record<string, unknown>) {
    this.calls.push({ op, detail })
  }

  // ---- test setup helpers ----
  registerTemplate(owner: string, repo: string, files: Record<string, string>, defaultBranch = 'main') {
    this.templates.set(this.key(owner, repo), { files, defaultBranch })
  }
  registerOAuthCode(code: string, user: GitHubUser, tokens?: Partial<OAuthTokens>) {
    this.oauthCodes.set(code, {
      user,
      tokens: { accessToken: `ghu_${user.login}_access`, refreshToken: `ghr_${user.login}_refresh`, expiresInSeconds: 28800, scopes: [], ...tokens },
    })
  }
  /** Simulate the learner pushing a commit to a branch from their own machine. */
  simulatePush(input: { owner: string; repo: string; branch: string; message: string; authorLogin: string; files: Record<string, string | null> }) {
    const r = this.repo(input.owner, input.repo)
    const parent = r.refs.get(input.branch)?.sha ?? r.refs.get(r.meta.name === input.repo ? 'main' : 'main')?.sha
    const parents = parent ? [parent] : []
    const commit: Commit = {
      sha: sha(['commit', input.message, input.authorLogin, ...parents, JSON.stringify(input.files)]),
      message: input.message,
      parents,
      authorLogin: input.authorLogin,
      files: Object.entries(input.files).map(([path, contentAtCommit]) => ({ path, contentAtCommit })),
    }
    r.commits.set(commit.sha, commit)
    r.refs.set(input.branch, { kind: 'branch', sha: commit.sha })
    return commit.sha
  }
  addCheckRun(owner: string, repo: string, run: CheckRun) {
    this.repo(owner, repo).checkRuns.push(run)
  }
  addRelease(owner: string, repo: string, release: Release) {
    this.repo(owner, repo).releases.push(release)
  }
  addTag(owner: string, repo: string, name: string, sha?: string) {
    const r = this.repo(owner, repo)
    const target = sha ?? r.refs.get('main')?.sha
    if (!target) throw new Error('no sha to tag')
    r.refs.set(name, { kind: 'tag', sha: target })
  }
  getRepoMeta(owner: string, repo: string): Repo {
    return this.repo(owner, repo).meta
  }

  // ---- OAuth ----
  async exchangeOAuthCode(code: string) {
    const hit = this.oauthCodes.get(code)
    if (!hit) throw new Error('bad oauth code')
    return { tokens: hit.tokens, user: hit.user }
  }
  async refreshOAuthToken(refreshToken: string): Promise<OAuthTokens> {
    if (!refreshToken.startsWith('ghr_')) throw new Error('bad refresh token')
    return { accessToken: refreshToken.replace('ghr_', 'ghu_').replace('_refresh', '_access2'), refreshToken, expiresInSeconds: 28800, scopes: [] }
  }

  // ---- repos ----
  async createRepoFromTemplate(input: { templateOwner: string; templateRepo: string; owner: string; name: string; private: boolean }): Promise<Repo> {
    const tpl = this.templates.get(this.key(input.templateOwner, input.templateRepo))
    if (!tpl) throw new Error('template not found')
    const meta: Repo = { owner: input.owner, name: input.name, htmlUrl: `https://github.com/${input.owner}/${input.name}`, private: input.private, archived: false }
    const seedFiles = Object.entries(tpl.files).map(([path, contentAtCommit]) => ({ path, contentAtCommit }))
    const seed: Commit = { sha: sha(['seed', input.owner, input.name]), message: 'Initial commit from template', parents: [], authorLogin: 'ledgerly-labs[bot]', files: seedFiles }
    const state: RepoState = {
      meta,
      refs: new Map([[tpl.defaultBranch, { kind: 'branch', sha: seed.sha }]]),
      commits: new Map([[seed.sha, seed]]),
      issues: [],
      prs: [],
      reviews: new Map(),
      comments: new Map(),
      checkRuns: [],
      releases: [],
      protection: new Map(),
      collaborators: new Map(),
    }
    this.repos.set(this.key(input.owner, input.name), state)
    this.record('createRepoFromTemplate', { ...input })
    return meta
  }
  async addCollaborator(input: { owner: string; repo: string; username: string; permission: 'pull' | 'push' | 'admin' }) {
    this.repo(input.owner, input.repo).collaborators.set(input.username, input.permission)
    this.record('addCollaborator', { ...input })
  }
  async setBranchProtection(input: BranchProtection & { owner: string; repo: string }) {
    const { owner, repo, ...protection } = input
    this.repo(owner, repo).protection.set(protection.branch, protection)
    this.record('setBranchProtection', { owner, repo, branch: protection.branch })
  }
  async getBranchProtection(input: { owner: string; repo: string; branch: string }): Promise<BranchProtection | null> {
    return this.repo(input.owner, input.repo).protection.get(input.branch) ?? null
  }
  async archiveRepo(input: { owner: string; repo: string }) {
    this.repo(input.owner, input.repo).meta.archived = true
    this.record('archiveRepo', { ...input })
  }

  // ---- refs / commits / content ----
  async listRefs(input: { owner: string; repo: string }): Promise<Ref[]> {
    const r = this.repo(input.owner, input.repo)
    return [...r.refs.entries()].map(([name, v]) => ({ ref: `refs/${v.kind === 'branch' ? 'heads' : 'tags'}/${name}`, sha: v.sha }))
  }
  async getRef(input: { owner: string; repo: string; ref: string }): Promise<Ref | null> {
    const short = input.ref.replace(/^refs\/(heads|tags)\//, '')
    const v = this.repo(input.owner, input.repo).refs.get(short)
    return v ? { ref: input.ref, sha: v.sha } : null
  }
  private walk(r: RepoState, tip: string): Commit[] {
    const out: Commit[] = []
    const seen = new Set<string>()
    const stack = [tip]
    while (stack.length) {
      const sha = stack.pop()!
      if (seen.has(sha)) continue
      seen.add(sha)
      const c = r.commits.get(sha)
      if (!c) continue
      out.push(c)
      stack.push(...c.parents)
    }
    return out
  }
  async commitFileToBranch(input: { owner: string; repo: string; branch: string; fromBranch?: string; path: string; content: string; message: string; authorLogin: string }): Promise<string> {
    const r = this.repo(input.owner, input.repo)
    if (!r.refs.has(input.branch)) {
      const from = r.refs.get(input.fromBranch ?? 'main')
      if (from) r.refs.set(input.branch, { kind: 'branch', sha: from.sha })
    }
    const parent = r.refs.get(input.branch)?.sha
    const parents = parent ? [parent] : []
    const commit: Commit = {
      sha: sha(['commit', input.message, input.authorLogin, ...parents, input.path, input.content]),
      message: input.message,
      parents,
      authorLogin: input.authorLogin,
      files: [{ path: input.path, contentAtCommit: input.content }],
    }
    r.commits.set(commit.sha, commit)
    r.refs.set(input.branch, { kind: 'branch', sha: commit.sha })
    this.record('commitFileToBranch', { owner: input.owner, repo: input.repo, branch: input.branch, path: input.path })
    return commit.sha
  }
  async listCommits(input: { owner: string; repo: string; ref: string }): Promise<Commit[]> {
    const r = this.repo(input.owner, input.repo)
    const short = input.ref.replace(/^refs\/(heads|tags)\//, '')
    const tip = r.refs.get(short)?.sha ?? (r.commits.has(input.ref) ? input.ref : null)
    return tip ? this.walk(r, tip) : []
  }
  async getFileContent(input: { owner: string; repo: string; ref: string; path: string }): Promise<string | null> {
    const commits = await this.listCommits(input)
    for (const c of commits) {
      const f = c.files.find((x) => x.path === input.path)
      if (f) return f.contentAtCommit
    }
    return null
  }

  // ---- issues / PRs / reviews ----
  async createIssue(input: { owner: string; repo: string; title: string; body: string }): Promise<Issue> {
    const r = this.repo(input.owner, input.repo)
    const issue: Issue = { number: r.issues.length + r.prs.length + 1, title: input.title, body: input.body, state: 'open' }
    r.issues.push(issue)
    this.record('createIssue', { owner: input.owner, repo: input.repo, number: issue.number })
    return issue
  }
  async getIssue(input: { owner: string; repo: string; number: number }): Promise<Issue | null> {
    return this.repo(input.owner, input.repo).issues.find((i) => i.number === input.number) ?? null
  }
  async listPullRequests(input: { owner: string; repo: string }): Promise<PullRequest[]> {
    return [...this.repo(input.owner, input.repo).prs]
  }
  async getPullRequest(input: { owner: string; repo: string; number: number }): Promise<PullRequest | null> {
    return this.repo(input.owner, input.repo).prs.find((p) => p.number === input.number) ?? null
  }
  async createPullRequest(input: { owner: string; repo: string; head: string; base: string; title: string; body: string; authorLogin: string }): Promise<PullRequest> {
    const r = this.repo(input.owner, input.repo)
    const pr: PullRequest = { number: r.issues.length + r.prs.length + 1, title: input.title, body: input.body, head: input.head, base: input.base, state: 'open', merged: false, mergeMethod: null, authorLogin: input.authorLogin }
    r.prs.push(pr)
    this.record('createPullRequest', { owner: input.owner, repo: input.repo, number: pr.number, head: input.head })
    return pr
  }
  async listReviews(input: { owner: string; repo: string; number: number }): Promise<Review[]> {
    return this.repo(input.owner, input.repo).reviews.get(input.number) ?? []
  }
  async createReview(input: { owner: string; repo: string; number: number; user: string; event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body: string }) {
    const r = this.repo(input.owner, input.repo)
    const state = input.event === 'APPROVE' ? 'APPROVED' : input.event === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' : 'COMMENTED'
    const list = r.reviews.get(input.number) ?? []
    list.push({ user: input.user, state, body: input.body })
    r.reviews.set(input.number, list)
    this.record('createReview', { owner: input.owner, repo: input.repo, number: input.number, user: input.user, event: input.event })
  }
  async createIssueComment(input: { owner: string; repo: string; number: number; user: string; body: string }) {
    const r = this.repo(input.owner, input.repo)
    const list = r.comments.get(input.number) ?? []
    list.push({ user: input.user, body: input.body })
    r.comments.set(input.number, list)
    this.record('createIssueComment', { owner: input.owner, repo: input.repo, number: input.number, user: input.user })
  }
  /** Test helper: read comments posted on an issue/PR. */
  getComments(owner: string, repo: string, number: number) {
    return this.repo(owner, repo).comments.get(number) ?? []
  }

  // ---- checks / releases ----
  async listCheckRuns(input: { owner: string; repo: string; ref: string }): Promise<CheckRun[]> {
    const r = this.repo(input.owner, input.repo)
    const short = input.ref.replace(/^refs\/(heads|tags)\//, '')
    const sha = r.refs.get(short)?.sha ?? input.ref
    return r.checkRuns.filter((c) => c.headSha === sha)
  }
  async listReleases(input: { owner: string; repo: string }): Promise<Release[]> {
    return [...this.repo(input.owner, input.repo).releases]
  }

  /** Resolve a branch name to its tip sha (test convenience). */
  tip(owner: string, repo: string, branch: string): string | null {
    return this.repo(owner, repo).refs.get(branch)?.sha ?? null
  }
  mergePullRequest(owner: string, repo: string, number: number, method: 'merge' | 'squash' | 'rebase') {
    const pr = this.repo(owner, repo).prs.find((p) => p.number === number)
    if (!pr) throw new Error('no pr')
    pr.state = 'closed'
    pr.merged = true
    pr.mergeMethod = method
  }
  closeIssue(owner: string, repo: string, number: number) {
    const i = this.repo(owner, repo).issues.find((x) => x.number === number)
    if (i) i.state = 'closed'
  }
}

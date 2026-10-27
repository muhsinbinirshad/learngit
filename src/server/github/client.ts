import type { BranchProtection, CheckRun, Commit, GitHubUser, Issue, OAuthTokens, PullRequest, Ref, Release, Repo, Review } from './types'

/**
 * Everything the server does against GitHub goes through this interface, so provisioning, bots and
 * validation are fully testable against an in-memory fake and the real implementation is swappable.
 * Write operations (`as` an installation token) and the OAuth user flow are both represented here.
 */
export interface GitHubClient {
  // --- OAuth (user authorization / "Sign in with GitHub") -----------------------------------
  exchangeOAuthCode(code: string): Promise<{ tokens: OAuthTokens; user: GitHubUser }>
  refreshOAuthToken(refreshToken: string): Promise<OAuthTokens>

  // --- repos -------------------------------------------------------------------------------
  createRepoFromTemplate(input: { templateOwner: string; templateRepo: string; owner: string; name: string; private: boolean }): Promise<Repo>
  addCollaborator(input: { owner: string; repo: string; username: string; permission: 'pull' | 'push' | 'admin' }): Promise<void>
  setBranchProtection(input: BranchProtection & { owner: string; repo: string }): Promise<void>
  getBranchProtection(input: { owner: string; repo: string; branch: string }): Promise<BranchProtection | null>
  archiveRepo(input: { owner: string; repo: string }): Promise<void>

  // --- refs / commits / content ------------------------------------------------------------
  listRefs(input: { owner: string; repo: string }): Promise<Ref[]>
  getRef(input: { owner: string; repo: string; ref: string }): Promise<Ref | null>
  /** Create `branch` (from `fromBranch`, default the default branch) if absent, then commit a file. Returns the new commit sha. */
  commitFileToBranch(input: { owner: string; repo: string; branch: string; fromBranch?: string; path: string; content: string; message: string; authorLogin: string }): Promise<string>
  listCommits(input: { owner: string; repo: string; ref: string }): Promise<Commit[]>
  getFileContent(input: { owner: string; repo: string; ref: string; path: string }): Promise<string | null>

  // --- pull requests / reviews / issues ----------------------------------------------------
  createIssue(input: { owner: string; repo: string; title: string; body: string }): Promise<Issue>
  getIssue(input: { owner: string; repo: string; number: number }): Promise<Issue | null>
  listPullRequests(input: { owner: string; repo: string }): Promise<PullRequest[]>
  getPullRequest(input: { owner: string; repo: string; number: number }): Promise<PullRequest | null>
  createPullRequest(input: { owner: string; repo: string; head: string; base: string; title: string; body: string; authorLogin: string }): Promise<PullRequest>
  listReviews(input: { owner: string; repo: string; number: number }): Promise<Review[]>
  createReview(input: { owner: string; repo: string; number: number; user: string; event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body: string }): Promise<void>
  createIssueComment(input: { owner: string; repo: string; number: number; user: string; body: string }): Promise<void>

  // --- checks / releases -------------------------------------------------------------------
  listCheckRuns(input: { owner: string; repo: string; ref: string }): Promise<CheckRun[]>
  listReleases(input: { owner: string; repo: string }): Promise<Release[]>
}

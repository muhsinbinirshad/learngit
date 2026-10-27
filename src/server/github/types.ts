/** The slice of GitHub's REST/GraphQL surface this service uses. Kept minimal and explicit. */

export interface Repo {
  owner: string
  name: string
  htmlUrl: string
  private: boolean
  archived: boolean
}

export interface Ref {
  ref: string // e.g. refs/heads/main
  sha: string
}

export interface Commit {
  sha: string
  message: string
  parents: string[]
  authorLogin: string | null
  /** Files touched (paths); used by content and history checks. */
  files: { path: string; contentAtCommit: string | null }[]
}

export interface PullRequest {
  number: number
  title: string
  body: string
  head: string // branch name
  base: string
  state: 'open' | 'closed'
  merged: boolean
  mergeMethod: 'merge' | 'squash' | 'rebase' | null
  authorLogin: string
}

export interface Review {
  user: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'
  body: string
}

export interface Issue {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
}

export interface CheckRun {
  name: string
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | null
  headSha: string
}

export interface BranchProtection {
  branch: string
  requirePullRequest: boolean
  requiredApprovingReviews: number
  requireStatusChecks: string[]
}

export interface Release {
  tagName: string
  name: string
  draft: boolean
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  /** Seconds until the access token expires, when the token type expires. */
  expiresInSeconds: number | null
  scopes: string[]
}

export interface GitHubUser {
  login: string
  id: number
}

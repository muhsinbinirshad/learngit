import type { GitHubClient } from '../github/client'

/**
 * Declarative checks for Real-mode labs, evaluated against live GitHub state via the GitHubClient.
 * This is the "different check provider" for the same lab idea: a GitHub lab's objectives are these
 * checks, evaluated after a webhook event or a "Check my work" click. (Sandbox labs use the engine's
 * repository checks; see src/engine/validator.)
 */
export type GitHubCheck =
  | { type: 'branchExists'; branch: string }
  | { type: 'commitOnBranch'; branch: string; messagePattern: string }
  | { type: 'fileContentOnBranch'; branch: string; path: string; pattern: string }
  | { type: 'noSecretInHistory'; branch: string; pattern: string }
  | { type: 'prOpen'; head: string }
  | { type: 'prMerged'; head: string }
  | { type: 'prMergeMethod'; head: string; method: 'merge' | 'squash' | 'rebase' }
  | { type: 'prHasApprovedReview'; head: string }
  | { type: 'prReferencesIssue'; head: string; issue: number }
  | { type: 'issueClosed'; issue: number }
  | { type: 'checkRunPassed'; ref: string; name: string }
  | { type: 'branchProtectionEnabled'; branch: string; minApprovals?: number }
  | { type: 'tagExists'; tag: string }
  | { type: 'releaseExists'; tag: string }
  | { type: 'forcePushUsedWithLease'; branch: string }

/** A recorded push webhook event, used for checks that can only be observed via events. */
export interface PushEvent {
  branch: string
  forced: boolean
  /** True when the push used `--force-with-lease` (GitHub reports this distinctly from a bare force). */
  withLease: boolean
}

export interface GitHubCheckContext {
  client: GitHubClient
  owner: string
  repo: string
  /** Push events recorded by the webhook receiver for this repo (for forcePushUsedWithLease). */
  pushEvents?: PushEvent[]
}

export interface GhObjective {
  id: string
  title: string
  check: GitHubCheck
}
export interface GhObjectiveResult {
  id: string
  met: boolean
  reason?: string
}

class CheckFailure extends Error {}
function fail(reason: string): never {
  throw new CheckFailure(reason)
}

async function findPr(ctx: GitHubCheckContext, head: string) {
  const prs = await ctx.client.listPullRequests({ owner: ctx.owner, repo: ctx.repo })
  return prs.find((p) => p.head === head) ?? null
}

export async function evaluateGitHubCheck(ctx: GitHubCheckContext, check: GitHubCheck): Promise<void> {
  const { client, owner, repo } = ctx
  switch (check.type) {
    case 'branchExists': {
      const ref = await client.getRef({ owner, repo, ref: `refs/heads/${check.branch}` })
      if (!ref) fail(`branch ${check.branch} does not exist`)
      return
    }
    case 'commitOnBranch': {
      const commits = await client.listCommits({ owner, repo, ref: `refs/heads/${check.branch}` })
      const re = new RegExp(check.messagePattern)
      if (!commits.some((c) => re.test(c.message))) fail(`no commit on ${check.branch} matches ${check.messagePattern}`)
      return
    }
    case 'fileContentOnBranch': {
      const content = await client.getFileContent({ owner, repo, ref: `refs/heads/${check.branch}`, path: check.path })
      if (content == null) fail(`${check.path} not found on ${check.branch}`)
      if (!new RegExp(check.pattern).test(content)) fail(`${check.path} does not match ${check.pattern}`)
      return
    }
    case 'noSecretInHistory': {
      const commits = await client.listCommits({ owner, repo, ref: `refs/heads/${check.branch}` })
      const re = new RegExp(check.pattern)
      for (const c of commits) {
        for (const f of c.files) {
          if (f.contentAtCommit && re.test(f.contentAtCommit)) fail(`secret still present in history at ${c.sha.slice(0, 7)} (${f.path})`)
        }
      }
      return
    }
    case 'prOpen': {
      const pr = await findPr(ctx, check.head)
      if (!pr || pr.state !== 'open') fail(`no open PR from ${check.head}`)
      return
    }
    case 'prMerged': {
      const pr = await findPr(ctx, check.head)
      if (!pr || !pr.merged) fail(`PR from ${check.head} is not merged`)
      return
    }
    case 'prMergeMethod': {
      const pr = await findPr(ctx, check.head)
      if (!pr || !pr.merged) fail(`PR from ${check.head} is not merged`)
      if (pr.mergeMethod !== check.method) fail(`PR merged with ${pr.mergeMethod}, expected ${check.method}`)
      return
    }
    case 'prHasApprovedReview': {
      const pr = await findPr(ctx, check.head)
      if (!pr) fail(`no PR from ${check.head}`)
      const reviews = await client.listReviews({ owner, repo, number: pr.number })
      if (!reviews.some((r) => r.state === 'APPROVED')) fail(`PR from ${check.head} has no approving review`)
      return
    }
    case 'prReferencesIssue': {
      const pr = await findPr(ctx, check.head)
      if (!pr) fail(`no PR from ${check.head}`)
      const re = new RegExp(`(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${check.issue}\\b|#${check.issue}\\b`, 'i')
      if (!re.test(pr.body)) fail(`PR does not reference issue #${check.issue}`)
      return
    }
    case 'issueClosed': {
      const issue = await client.getIssue({ owner, repo, number: check.issue })
      if (!issue || issue.state !== 'closed') fail(`issue #${check.issue} is not closed`)
      return
    }
    case 'checkRunPassed': {
      const runs = await client.listCheckRuns({ owner, repo, ref: check.ref })
      const re = new RegExp(check.name)
      if (!runs.some((r) => re.test(r.name) && r.conclusion === 'success')) fail(`no passing check run matching ${check.name} on ${check.ref}`)
      return
    }
    case 'branchProtectionEnabled': {
      const protection = await client.getBranchProtection({ owner, repo, branch: check.branch })
      if (!protection) fail(`branch protection not enabled on ${check.branch}`)
      if (check.minApprovals != null && protection.requiredApprovingReviews < check.minApprovals) {
        fail(`branch protection requires ${protection.requiredApprovingReviews} approvals, need ${check.minApprovals}`)
      }
      return
    }
    case 'tagExists': {
      const ref = await client.getRef({ owner, repo, ref: `refs/tags/${check.tag}` })
      if (!ref) fail(`tag ${check.tag} does not exist`)
      return
    }
    case 'releaseExists': {
      const releases = await client.listReleases({ owner, repo })
      if (!releases.some((r) => r.tagName === check.tag && !r.draft)) fail(`no published release for ${check.tag}`)
      return
    }
    case 'forcePushUsedWithLease': {
      const events = ctx.pushEvents ?? []
      if (!events.some((e) => e.branch === check.branch && e.forced && e.withLease)) {
        fail(`no force-with-lease push observed on ${check.branch}`)
      }
      return
    }
    default: {
      const never: never = check
      fail(`unknown github check ${(never as { type: string }).type}`)
    }
  }
}

/**
 * The Real-mode check provider. Evaluates a lab's GitHub objectives against live repository state.
 * This is the Phase-5 implementation behind the GitHubProvider interface introduced in Phase 3.
 */
export class GitHubProvider {
  readonly mode = 'github' as const
  constructor(private readonly ctx: GitHubCheckContext) {}

  async evaluate(objectives: GhObjective[]): Promise<GhObjectiveResult[]> {
    const out: GhObjectiveResult[] = []
    for (const o of objectives) {
      try {
        await evaluateGitHubCheck(this.ctx, o.check)
        out.push({ id: o.id, met: true })
      } catch (e) {
        out.push({ id: o.id, met: false, reason: e instanceof Error ? e.message : String(e) })
      }
    }
    return out
  }
}

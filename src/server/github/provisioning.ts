import { randomUUID } from 'node:crypto'
import type { ServerConfig } from '../config'
import type { Store } from '../domain/store'
import { audit } from '../domain/audit'
import type { Cohort, LabAttempt, User } from '../domain/types'
import type { GitHubClient } from './client'

/** Lab-specific setup applied to a freshly provisioned repo. All optional. */
export interface LabProvisioningSpec {
  labId: string
  /** Protect a branch (default: main) with required reviews / status checks. */
  branchProtection?: { branch?: string; requiredApprovingReviews?: number; requireStatusChecks?: string[] }
  /** Issues to seed (e.g. the ticket the learner's PR should close). */
  issues?: { title: string; body: string }[]
  /** Pull requests to seed, authored by a bot teammate (e.g. an existing review to respond to). */
  seededPRs?: { branch: string; path: string; content: string; message: string; title: string; body: string; botLogin: string; base?: string }[]
}

/** A lab repo name: {cohort}-{lab-slug}-{github-username}. Sanitized to GitHub's allowed charset. */
export function labRepoName(cohortSlug: string, labId: string, githubLogin: string): string {
  return `${cohortSlug}-${labId}-${githubLogin}`.toLowerCase().replace(/[^a-z0-9-_.]/g, '-')
}

/**
 * Provision a lab repo in the classroom organization from the Ledgerly template, add the learner as
 * a write collaborator (never admin, never on their personal account), apply lab-specific setup, and
 * record a LabAttempt. Returns the attempt.
 */
export async function provisionLabRepo(
  deps: { client: GitHubClient; store: Store; config: ServerConfig },
  input: { user: User; cohort: Cohort; spec: LabProvisioningSpec },
): Promise<LabAttempt> {
  const { client, store, config } = deps
  const name = labRepoName(input.cohort.slug, input.spec.labId, input.user.githubLogin)
  const now = new Date().toISOString()

  const attempt: LabAttempt = {
    id: randomUUID(),
    userId: input.user.id,
    cohortId: input.cohort.id,
    labId: input.spec.labId,
    status: 'provisioning',
    repo: null,
    objectives: {},
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  }
  await store.createAttempt(attempt)

  const repo = await client.createRepoFromTemplate({
    templateOwner: config.templateOwner,
    templateRepo: config.templateRepo,
    owner: config.classroomOrg,
    name,
    private: true,
  })

  // Learner gets write access only, on the classroom-org repo we just created.
  await client.addCollaborator({ owner: config.classroomOrg, repo: name, username: input.user.githubLogin, permission: 'push' })

  // Lab-specific setup.
  const spec = input.spec
  if (spec.branchProtection) {
    await client.setBranchProtection({
      owner: config.classroomOrg,
      repo: name,
      branch: spec.branchProtection.branch ?? 'main',
      requirePullRequest: true,
      requiredApprovingReviews: spec.branchProtection.requiredApprovingReviews ?? 1,
      requireStatusChecks: spec.branchProtection.requireStatusChecks ?? [],
    })
  }
  for (const issue of spec.issues ?? []) {
    await client.createIssue({ owner: config.classroomOrg, repo: name, title: issue.title, body: issue.body })
  }
  for (const pr of spec.seededPRs ?? []) {
    await client.commitFileToBranch({ owner: config.classroomOrg, repo: name, branch: pr.branch, path: pr.path, content: pr.content, message: pr.message, authorLogin: pr.botLogin })
    await client.createPullRequest({ owner: config.classroomOrg, repo: name, head: pr.branch, base: pr.base ?? 'main', title: pr.title, body: pr.body, authorLogin: pr.botLogin })
  }

  const provisioned = await store.updateAttempt(attempt.id, { status: 'in_progress', repo: { owner: repo.owner, name: repo.name, htmlUrl: repo.htmlUrl } })
  await audit(store, 'repo.provisioned', input.user.id, { repo: `${repo.owner}/${repo.name}`, labId: spec.labId, cohort: input.cohort.slug })
  return provisioned
}

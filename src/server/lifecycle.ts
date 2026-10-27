import type { ServerConfig } from './config'
import type { Store } from './domain/store'
import { audit } from './domain/audit'
import type { LabAttempt } from './domain/types'
import type { GitHubClient } from './github/client'

interface LifecycleDeps {
  client: GitHubClient
  store: Store
  config: ServerConfig
}

/** Archive a single lab repo and mark its attempt archived. Idempotent. */
export async function archiveAttempt(deps: LifecycleDeps, attempt: LabAttempt, reason: string): Promise<void> {
  if (attempt.status === 'archived') return
  if (attempt.repo) {
    await deps.client.archiveRepo({ owner: attempt.repo.owner, repo: attempt.repo.name })
  }
  await deps.store.updateAttempt(attempt.id, { status: 'archived' })
  await audit(deps.store, 'repo.archived', attempt.userId, { repo: attempt.repo ? `${attempt.repo.owner}/${attempt.repo.name}` : null, reason })
}

/** Mark an attempt validated (all objectives met). The repo is left live for the learner to revisit. */
export async function markValidated(deps: LifecycleDeps, attempt: LabAttempt): Promise<LabAttempt> {
  const updated = await deps.store.updateAttempt(attempt.id, { status: 'validated' })
  await deps.store.setProgress({ userId: attempt.userId, labId: attempt.labId, completedAt: new Date().toISOString() })
  await audit(deps.store, 'lab.validated', attempt.userId, { repo: attempt.repo ? `${attempt.repo.owner}/${attempt.repo.name}` : null, labId: attempt.labId })
  return updated
}

/** Archive in-progress repos in a cohort that have been inactive past the cohort's threshold. */
export async function archiveInactiveInCohort(deps: LifecycleDeps, cohortId: string, now: Date = new Date()): Promise<number> {
  const cohort = await deps.store.getCohort(cohortId)
  if (!cohort) throw new Error(`no cohort ${cohortId}`)
  const cutoff = new Date(now.getTime() - cohort.archiveAfterDays * 86_400_000).toISOString()
  const attempts = await deps.store.listCohortAttempts(cohortId)
  let archived = 0
  for (const a of attempts) {
    if ((a.status === 'in_progress' || a.status === 'validated') && a.lastActivityAt < cutoff) {
      await archiveAttempt(deps, a, 'inactivity')
      archived++
    }
  }
  return archived
}

/** Instructor action: archive every repo in a cohort (end-of-course cleanup). */
export async function bulkCleanupCohort(deps: LifecycleDeps, cohortId: string, instructorId: string): Promise<number> {
  const attempts = await deps.store.listCohortAttempts(cohortId)
  let archived = 0
  for (const a of attempts) {
    if (a.status !== 'archived') {
      await archiveAttempt(deps, a, 'bulk-cleanup')
      archived++
    }
  }
  await audit(deps.store, 'cohort.bulk_cleanup', instructorId, { cohortId, archived })
  return archived
}

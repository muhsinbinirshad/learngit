import type { ServerConfig } from './config'
import type { Store } from './domain/store'
import { audit } from './domain/audit'
import type { LabAttempt, User } from './domain/types'
import type { GitHubClient } from './github/client'
import { authorizeUrl, createState, handleCallback } from './github/oauth'
import { WebhookReceiver, type WebhookRequest, type WebhookDelivery } from './github/webhooks'
import { provisionLabRepo, type LabProvisioningSpec } from './github/provisioning'
import { BotEngine, repoFromPayload } from './bots/engine'
import { GitHubProvider, type GhObjective, type PushEvent } from './validator/githubChecks'
import { getRealModeLab } from './realmode/labs'
import { archiveInactiveInCohort, bulkCleanupCohort, markValidated } from './lifecycle'

/** Webhook events that should re-run validation for the affected lab attempt. */
const VALIDATION_EVENTS = new Set(['push', 'pull_request', 'pull_request_review', 'issues', 'issue_comment', 'check_run', 'release'])

/**
 * The Real-mode lab runner ties the pieces together: sign-in, repo provisioning, the webhook path
 * (verify → bots react → re-validate), and the "Check my work" button. It is the server-side
 * counterpart of the client's Real-mode workspace from Phase 3.
 */
export class LabRunner {
  private readonly receiver: WebhookReceiver
  /** Push events per repo, for checks that can only be observed via events (force-with-lease). */
  private readonly pushEvents = new Map<string, PushEvent[]>()
  /** Repos that have shown a failing CI check, so a later success earns the "CI Green" badge. */
  private readonly repoHadFailingCheck = new Set<string>()

  constructor(
    private readonly deps: { client: GitHubClient; store: Store; config: ServerConfig; bots: BotEngine },
  ) {
    this.receiver = new WebhookReceiver(deps.config.githubWebhookSecret, deps.store)
  }

  // --- sign in ---
  startSignIn(): { url: string; state: string } {
    const state = createState(this.deps.config.githubClientSecret)
    return { url: authorizeUrl(this.deps.config, state), state }
  }
  completeSignIn(input: { code: string; state: string }): Promise<User> {
    return handleCallback({ config: this.deps.config, client: this.deps.client, store: this.deps.store }, input)
  }

  // --- provisioning ---
  async provision(input: { userId: string; cohortId: string; spec: LabProvisioningSpec }): Promise<LabAttempt> {
    const user = await this.deps.store.getUser(input.userId)
    if (!user) throw new Error('unknown user')
    const cohort = await this.deps.store.getCohort(input.cohortId)
    if (!cohort) throw new Error('unknown cohort')
    return provisionLabRepo({ client: this.deps.client, store: this.deps.store, config: this.deps.config }, { user, cohort, spec: input.spec })
  }

  // --- webhook path ---
  async handleWebhook(req: WebhookRequest): Promise<{ status: string; firedBots: string[]; revalidated: LabAttempt | null }> {
    const outcome = await this.receiver.receive(req)
    if (outcome.status !== 'ok') return { status: outcome.status, firedBots: [], revalidated: null }
    const { delivery } = outcome

    // Record push events (for force-with-lease detection) and bump activity.
    const loc = repoFromPayload(delivery.payload)
    if (loc && delivery.event === 'push') {
      const branch = (delivery.payload.ref as string | undefined)?.replace('refs/heads/', '') ?? ''
      const key = `${loc.owner}/${loc.repo}`
      const forced = delivery.payload.forced === true
      const list = this.pushEvents.get(key) ?? []
      list.push({ branch, forced, withLease: forced && delivery.payload.lease !== false })
      this.pushEvents.set(key, list)
    }

    // Bots react.
    const firedBots = await this.deps.bots.handle({ client: this.deps.client }, delivery)

    // Award Real-GitHub badges from the event, and re-validate the affected attempt.
    let revalidated: LabAttempt | null = null
    if (loc) {
      const attempt = await this.deps.store.getAttemptByRepo(loc.owner, loc.repo)
      if (attempt) {
        await this.awardBadges(delivery, loc, attempt.userId)
        if (VALIDATION_EVENTS.has(delivery.event) && getRealModeLab(attempt.labId)) {
          await this.deps.store.updateAttempt(attempt.id, { lastActivityAt: new Date().toISOString() })
          revalidated = await this.checkWork(attempt.id)
        }
      }
    }
    return { status: 'ok', firedBots, revalidated }
  }

  /** Award event-driven Real-mode badges: first merged PR, and turning a failing CI check green. */
  private async awardBadges(delivery: WebhookDelivery, loc: { owner: string; repo: string }, userId: string): Promise<void> {
    const key = `${loc.owner}/${loc.repo}`
    const now = new Date().toISOString()

    if (delivery.event === 'pull_request' && delivery.payload.action === 'closed') {
      const pr = delivery.payload.pull_request as { merged?: boolean } | undefined
      if (pr?.merged) {
        if (await this.deps.store.awardBadge({ userId, badgeId: 'shipped-real-github', source: 'github', awardedAt: now })) {
          await audit(this.deps.store, 'badge.awarded', userId, { badge: 'shipped-real-github', repo: key })
        }
      }
    }

    if (delivery.event === 'check_run') {
      const conclusion = (delivery.payload.check_run as { conclusion?: string } | undefined)?.conclusion
      if (conclusion === 'failure') {
        this.repoHadFailingCheck.add(key)
      } else if (conclusion === 'success' && this.repoHadFailingCheck.has(key)) {
        if (await this.deps.store.awardBadge({ userId, badgeId: 'ci-green', source: 'github', awardedAt: now })) {
          await audit(this.deps.store, 'badge.awarded', userId, { badge: 'ci-green', repo: key })
        }
      }
    }
  }

  /** Progress + badges for a user — the read side of backend-synced progress. */
  listBadges(userId: string) {
    return this.deps.store.listBadges(userId)
  }
  getProgress(userId: string) {
    return this.deps.store.getProgress(userId)
  }

  // --- validation ("Check my work") ---
  async checkWork(attemptId: string): Promise<LabAttempt> {
    const attempt = await this.deps.store.getAttempt(attemptId)
    if (!attempt) throw new Error('unknown attempt')
    if (!attempt.repo) throw new Error('attempt has no repo yet')
    const lab = getRealModeLab(attempt.labId)
    if (!lab) throw new Error(`no real-mode lab ${attempt.labId}`)

    const provider = new GitHubProvider({
      client: this.deps.client,
      owner: attempt.repo.owner,
      repo: attempt.repo.name,
      pushEvents: this.pushEvents.get(`${attempt.repo.owner}/${attempt.repo.name}`) ?? [],
    })
    const results = await provider.evaluate(lab.objectives as GhObjective[])
    const objectives = Object.fromEntries(results.map((r) => [r.id, r.met]))
    const updated = await this.deps.store.updateAttempt(attemptId, { objectives })

    const allMet = lab.objectives.length > 0 && lab.objectives.every((o) => objectives[o.id])
    if (allMet && updated.status !== 'validated') {
      return markValidated({ client: this.deps.client, store: this.deps.store, config: this.deps.config }, updated)
    }
    return updated
  }

  // --- instructor lifecycle passthroughs ---
  archiveInactive(cohortId: string, now?: Date) {
    return archiveInactiveInCohort({ client: this.deps.client, store: this.deps.store, config: this.deps.config }, cohortId, now)
  }
  bulkCleanup(cohortId: string, instructorId: string) {
    return bulkCleanupCohort({ client: this.deps.client, store: this.deps.store, config: this.deps.config }, cohortId, instructorId)
  }
}

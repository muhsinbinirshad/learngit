import type { GitHubClient } from '../github/client'
import type { Store } from '../domain/store'
import { audit } from '../domain/audit'
import type { WebhookDelivery } from '../github/webhooks'

/**
 * Bot teammates. Bots act through the GitHub App, but present as named fictional engineers: every
 * comment, review or commit they make is attributed to a persona (its name leads the body, so the
 * App's single bot identity reads as distinct, professional teammates). Scenarios are triggered by
 * webhook events — e.g. "when the learner opens a PR, Mira requests a change on it".
 */
export interface BotPersona {
  /** Fictional engineer name, e.g. "Mira Shah". */
  name: string
  /** Their role, shown with the name. */
  role: string
}

/** The App's bot identity on GitHub; all bot actions are performed as this actor. */
export const APP_BOT_LOGIN = 'ledgerly-labs[bot]'

/** Prefix a message so it reads as coming from a specific teammate. */
export function speakAs(persona: BotPersona, body: string): string {
  return `**${persona.name}** · _${persona.role}_\n\n${body}`
}

export interface BotContext {
  client: GitHubClient
  owner: string
  repo: string
  payload: Record<string, unknown>
  delivery: WebhookDelivery
}

export interface BotScenario {
  id: string
  /** GitHub event name, e.g. "pull_request". */
  event: string
  /** Optional action filter, e.g. "opened". */
  action?: string
  /** Optional lab gate: only run for this lab (matched by caller). */
  labId?: string
  run(ctx: BotContext): Promise<void>
}

/** Extract { owner, repo } from a webhook payload's repository object. */
export function repoFromPayload(payload: Record<string, unknown>): { owner: string; repo: string } | null {
  const repository = payload.repository as { name?: string; owner?: { login?: string }; full_name?: string } | undefined
  if (repository?.owner?.login && repository.name) return { owner: repository.owner.login, repo: repository.name }
  if (repository?.full_name?.includes('/')) {
    const [owner, repo] = repository.full_name.split('/')
    if (owner && repo) return { owner, repo }
  }
  return null
}

export class BotEngine {
  constructor(
    private readonly scenarios: BotScenario[],
    private readonly store: Store,
  ) {}

  /** Run every scenario whose trigger matches this delivery. Returns the ids that fired. */
  async handle(deps: { client: GitHubClient }, delivery: WebhookDelivery): Promise<string[]> {
    const action = (delivery.payload.action as string | undefined) ?? undefined
    const loc = repoFromPayload(delivery.payload)
    if (!loc) return []
    const fired: string[] = []
    for (const s of this.scenarios) {
      if (s.event !== delivery.event) continue
      if (s.action && s.action !== action) continue
      await s.run({ client: deps.client, owner: loc.owner, repo: loc.repo, payload: delivery.payload, delivery })
      await audit(this.store, 'bot.fired', null, { scenario: s.id, event: delivery.event, repo: `${loc.owner}/${loc.repo}` })
      fired.push(s.id)
    }
    return fired
  }
}

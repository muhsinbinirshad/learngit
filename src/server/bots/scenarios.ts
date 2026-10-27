import { APP_BOT_LOGIN, speakAs, type BotPersona, type BotScenario } from './engine'

const MIRA: BotPersona = { name: 'Mira Shah', role: 'Senior Engineer, Frontend' }
const LUCA: BotPersona = { name: 'Luca Rossi', role: 'Backend Engineer' }

function pullNumber(payload: Record<string, unknown>): number | null {
  const pr = payload.pull_request as { number?: number } | undefined
  return pr?.number ?? null
}
function pushedBranch(payload: Record<string, unknown>): string | null {
  const ref = payload.ref as string | undefined
  return ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null
}

/**
 * When the learner opens their first pull request, Mira reviews it and requests one change — the
 * kind of small, specific review note a real teammate leaves. This is the bot reaction the Track-3
 * "open your first PR" lab is built around.
 */
export const reviewFirstPR: BotScenario = {
  id: 'review-first-pr',
  event: 'pull_request',
  action: 'opened',
  async run(ctx) {
    const number = pullNumber(ctx.payload)
    if (number == null) return
    await ctx.client.createReview({
      owner: ctx.owner,
      repo: ctx.repo,
      number,
      user: APP_BOT_LOGIN,
      event: 'REQUEST_CHANGES',
      body: speakAs(MIRA, "Thanks for the PR! One thing before I approve: please add a test for the new behavior, and reference the issue this closes in the description (e.g. `Closes #1`). Ping me when it's updated."),
    })
  },
}

/**
 * While the learner works on a feature branch, Luca lands a conflicting change on main — so the
 * learner has to rebase and resolve, exactly like real life. Used by the rebase/conflict labs.
 */
export const conflictingCommitOnMain: BotScenario = {
  id: 'conflicting-commit-on-main',
  event: 'push',
  async run(ctx) {
    const branch = pushedBranch(ctx.payload)
    if (!branch || branch === 'main') return // only react to feature-branch pushes
    await ctx.client.commitFileToBranch({
      owner: ctx.owner,
      repo: ctx.repo,
      branch: 'main',
      path: 'README.md',
      content: `# Ledgerly\n\nInvoicing that does the chasing for you. (updated by ${LUCA.name})\n`,
      message: 'docs: tweak tagline on main',
      authorLogin: APP_BOT_LOGIN,
    })
  },
}

export const DEFAULT_SCENARIOS: BotScenario[] = [reviewFirstPR, conflictingCommitOnMain]

/**
 * Badge catalog, shared by the client (Achievements page) and the server (award logic).
 *
 * `source` is where the badge is earned:
 *  - "sandbox": earned in the in-browser labs; computed from local/synced progress (`requires`).
 *  - "github": earned by doing real work on real GitHub; awarded server-side from webhook events and
 *    carries a "Real GitHub" indicator in the UI.
 */
export type BadgeSource = 'sandbox' | 'github'

export interface Badge {
  id: string
  title: string
  description: string
  icon: string
  source: BadgeSource
  /** Sandbox badges: earned when all these labs are complete. (github badges are awarded by the backend.) */
  requires?: string[]
}

export const BADGES: Badge[] = [
  { id: 'first-save', title: 'First save', description: 'Made your first commit.', icon: 'save', source: 'sandbox', requires: ['t1-first-commit'] },
  { id: 'historian', title: 'Historian', description: 'Read a repository’s history with log, blame and show.', icon: 'history', source: 'sandbox', requires: ['t1-read-history'] },
  { id: 'branch-builder', title: 'Branch builder', description: 'Built a feature on its own branch.', icon: 'account_tree', source: 'sandbox', requires: ['t2-feature-branch'] },
  { id: 'conflict-resolver', title: 'Conflict resolver', description: 'Resolved a merge conflict, keeping both intents.', icon: 'merge', source: 'sandbox', requires: ['t2-merge-conflict'] },
  { id: 'time-traveler', title: 'Time traveler', description: 'Recovered a commit with the reflog.', icon: 'restore', source: 'sandbox', requires: ['t5-reflog'] },
  { id: 'safe-hands', title: 'Safe hands', description: 'Undid a bad change on a shared branch with revert.', icon: 'undo', source: 'sandbox', requires: ['t5-revert'] },
  { id: 'back-porter', title: 'Back-porter', description: 'Cherry-picked a fix onto a release branch.', icon: 'commit', source: 'sandbox', requires: ['t4-cherry-pick'] },

  // Real-mode badges — awarded by the backend from real GitHub events. These show a "Real GitHub" indicator.
  { id: 'shipped-real-github', title: 'Shipped on Real GitHub', description: 'Got your first pull request reviewed and merged on real GitHub.', icon: 'rocket_launch', source: 'github' },
  { id: 'ci-green', title: 'CI Green', description: 'Turned a failing GitHub Actions check green.', icon: 'check_circle', source: 'github' },
]

export const badgesById: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]))

/** Sandbox badges earned, given the set of completed lab ids. */
export function earnedSandboxBadges(completed: Set<string>): string[] {
  return BADGES.filter((b) => b.source === 'sandbox' && (b.requires ?? []).every((id) => completed.has(id))).map((b) => b.id)
}

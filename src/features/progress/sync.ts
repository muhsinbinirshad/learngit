import { useProgress } from './store'

/**
 * Progress + badges sync. By design, authoritative progress lives in the Phase 5 backend (so it
 * follows a learner across devices), not only in this browser's localStorage. This module reads that
 * state from the backend and feeds it into the local store, which acts as a cache for offline use.
 *
 * Real-mode badges ("Shipped on Real GitHub", "CI Green") are *only* awarded server-side from real
 * GitHub events, so they can only arrive through this sync — never from local computation.
 */
export interface ProgressSync {
  /** Badge ids the learner has earned (sandbox + github), from the backend. */
  pullBadges(): Promise<string[]>
  /** Completed lab ids recorded on the backend. */
  pullProgress(): Promise<string[]>
}

/** Talks to the Phase 5 backend. `userId` identifies the signed-in learner; the token stays server-side. */
export class BackendProgressSync implements ProgressSync {
  constructor(
    private readonly baseUrl: string,
    private readonly userId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async pullBadges(): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/users/${encodeURIComponent(this.userId)}/badges`, { credentials: 'include' })
    if (!res.ok) throw new Error(`badges sync failed: ${res.status}`)
    const body = (await res.json()) as { badges: { badgeId: string }[] }
    return body.badges.map((b) => b.badgeId)
  }

  async pullProgress(): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/users/${encodeURIComponent(this.userId)}/progress`, { credentials: 'include' })
    if (!res.ok) throw new Error(`progress sync failed: ${res.status}`)
    const body = (await res.json()) as { progress: { labId: string; completedAt: string | null }[] }
    return body.progress.filter((p) => p.completedAt).map((p) => p.labId)
  }
}

/**
 * Pull real-mode badges from the backend into the local store. Call after sign-in and after a
 * "Check my work" that may have earned one. Fails quietly offline — the UI still shows sandbox badges.
 */
export async function syncRealModeBadges(sync: ProgressSync): Promise<void> {
  try {
    const earned = await sync.pullBadges()
    const githubEarned = earned // the store filters to github badges by catalog source when rendering
    useProgress.getState().setRealModeBadges(githubEarned)
  } catch {
    /* offline or not signed in: keep whatever is cached */
  }
}

import type { AuditEntry, AwardedBadge, Cohort, LabAttempt, ProgressRecord, StoredToken, User } from './types'

/**
 * Persistence boundary. The in-memory implementation (memoryStore.ts) backs tests and local dev;
 * a production implementation maps each method to Supabase/Postgres tables of the same name:
 *   users, cohorts, lab_attempts, progress, audit_log, tokens.
 * Tokens are stored only as ciphertext (see tokens.ts); the store never sees plaintext secrets.
 */
export interface Store {
  // users
  upsertUser(user: User): Promise<User>
  getUserByGithubId(githubUserId: number): Promise<User | null>
  getUser(id: string): Promise<User | null>

  // cohorts
  createCohort(cohort: Cohort): Promise<Cohort>
  getCohort(id: string): Promise<Cohort | null>
  listCohortAttempts(cohortId: string): Promise<LabAttempt[]>

  // lab attempts
  createAttempt(attempt: LabAttempt): Promise<LabAttempt>
  getAttempt(id: string): Promise<LabAttempt | null>
  getAttemptByRepo(owner: string, name: string): Promise<LabAttempt | null>
  updateAttempt(id: string, patch: Partial<LabAttempt>): Promise<LabAttempt>
  listAttemptsOlderThan(isoCutoff: string): Promise<LabAttempt[]>

  // progress
  setProgress(record: ProgressRecord): Promise<void>
  getProgress(userId: string): Promise<ProgressRecord[]>

  // badges
  /** Award a badge. Idempotent: awarding the same badge to the same user again is a no-op. Returns true if newly awarded. */
  awardBadge(badge: AwardedBadge): Promise<boolean>
  listBadges(userId: string): Promise<AwardedBadge[]>

  // audit
  appendAudit(entry: AuditEntry): Promise<void>
  listAudit(limit?: number): Promise<AuditEntry[]>

  // tokens (ciphertext only)
  putToken(token: StoredToken): Promise<void>
  getToken(userId: string, kind: StoredToken['kind']): Promise<StoredToken | null>
  deleteToken(userId: string, kind: StoredToken['kind']): Promise<void>

  // webhook idempotency / replay protection
  /** Returns true if this delivery id was already processed (so the caller can skip it). */
  seenDelivery(deliveryId: string): Promise<boolean>
  markDelivery(deliveryId: string, at: string): Promise<void>
}

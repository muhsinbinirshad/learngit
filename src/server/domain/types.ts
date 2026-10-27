/** Backend domain model. In production these map to Postgres tables (see store.ts); the in-memory
 *  store mirrors the same shapes so the service runs and is fully testable without a database. */

export interface User {
  id: string
  githubLogin: string
  githubUserId: number
  /** Learners are added to lab repos as write collaborators; instructors manage cohorts. */
  role: 'learner' | 'instructor'
  createdAt: string
}

export interface Cohort {
  id: string
  /** Short slug used in repo names, e.g. "fall25". */
  slug: string
  name: string
  instructorId: string
  createdAt: string
  /** Auto-archive lab repos after this many days of inactivity. */
  archiveAfterDays: number
}

export type LabAttemptStatus = 'provisioning' | 'in_progress' | 'validated' | 'archived' | 'failed'

export interface LabAttempt {
  id: string
  userId: string
  cohortId: string
  labId: string
  status: LabAttemptStatus
  /** The provisioned GitHub repo, once created. */
  repo: { owner: string; name: string; htmlUrl: string } | null
  /** Objective id -> met. */
  objectives: Record<string, boolean>
  createdAt: string
  updatedAt: string
  /** Last activity (push, PR, check) seen via webhook — drives inactivity archival. */
  lastActivityAt: string
}

export interface ProgressRecord {
  userId: string
  labId: string
  completedAt: string | null
}

export interface AwardedBadge {
  userId: string
  badgeId: string
  /** Where it was earned; "github" badges carry a Real-GitHub indicator in the UI. */
  source: 'sandbox' | 'github'
  awardedAt: string
}

export interface AuditEntry {
  id: string
  at: string
  actorId: string | null
  /** e.g. "repo.provisioned", "token.stored", "webhook.received", "lab.validated". */
  action: string
  /** Non-sensitive detail only. Never store tokens or secrets here. */
  detail: Record<string, string | number | boolean | null>
}

/** Encrypted token record. The ciphertext is produced by tokens.ts (AES-256-GCM). */
export interface StoredToken {
  userId: string
  kind: 'user' | 'installation'
  /** AES-256-GCM: iv:authTag:ciphertext, all hex. The plaintext token never touches the database. */
  ciphertext: string
  expiresAt: string | null
  /** Encrypted refresh token, when the token type supports refresh. */
  refreshCiphertext: string | null
}

import type { Store } from './store'
import type { AuditEntry, AwardedBadge, Cohort, LabAttempt, ProgressRecord, StoredToken, User } from './types'

/** In-memory Store. Deterministic and dependency-free, for tests and local development. */
export function createMemoryStore(): Store {
  const users = new Map<string, User>()
  const usersByGithub = new Map<number, string>()
  const cohorts = new Map<string, Cohort>()
  const attempts = new Map<string, LabAttempt>()
  const progress = new Map<string, ProgressRecord>()
  const audit: AuditEntry[] = []
  const tokens = new Map<string, StoredToken>()
  const deliveries = new Map<string, string>()
  const badges = new Map<string, AwardedBadge>()

  const tokenKey = (userId: string, kind: StoredToken['kind']) => `${userId}:${kind}`
  const progressKey = (userId: string, labId: string) => `${userId}:${labId}`

  return {
    async upsertUser(user) {
      users.set(user.id, user)
      usersByGithub.set(user.githubUserId, user.id)
      return user
    },
    async getUserByGithubId(githubUserId) {
      const id = usersByGithub.get(githubUserId)
      return id ? (users.get(id) ?? null) : null
    },
    async getUser(id) {
      return users.get(id) ?? null
    },

    async createCohort(cohort) {
      cohorts.set(cohort.id, cohort)
      return cohort
    },
    async getCohort(id) {
      return cohorts.get(id) ?? null
    },
    async listCohortAttempts(cohortId) {
      return [...attempts.values()].filter((a) => a.cohortId === cohortId)
    },

    async createAttempt(attempt) {
      attempts.set(attempt.id, attempt)
      return attempt
    },
    async getAttempt(id) {
      return attempts.get(id) ?? null
    },
    async getAttemptByRepo(owner, name) {
      return [...attempts.values()].find((a) => a.repo?.owner === owner && a.repo?.name === name) ?? null
    },
    async updateAttempt(id, patch) {
      const cur = attempts.get(id)
      if (!cur) throw new Error(`no attempt ${id}`)
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
      attempts.set(id, next)
      return next
    },
    async listAttemptsOlderThan(isoCutoff) {
      return [...attempts.values()].filter((a) => a.lastActivityAt < isoCutoff)
    },

    async setProgress(record) {
      progress.set(progressKey(record.userId, record.labId), record)
    },
    async getProgress(userId) {
      return [...progress.values()].filter((p) => p.userId === userId)
    },

    async awardBadge(badge) {
      const key = `${badge.userId}:${badge.badgeId}`
      if (badges.has(key)) return false
      badges.set(key, badge)
      return true
    },
    async listBadges(userId) {
      return [...badges.values()].filter((b) => b.userId === userId)
    },

    async appendAudit(entry) {
      audit.push(entry)
    },
    async listAudit(limit = 100) {
      return audit.slice(-limit).reverse()
    },

    async putToken(token) {
      tokens.set(tokenKey(token.userId, token.kind), token)
    },
    async getToken(userId, kind) {
      return tokens.get(tokenKey(userId, kind)) ?? null
    },
    async deleteToken(userId, kind) {
      tokens.delete(tokenKey(userId, kind))
    },

    async seenDelivery(deliveryId) {
      return deliveries.has(deliveryId)
    },
    async markDelivery(deliveryId, at) {
      deliveries.set(deliveryId, at)
    },
  }
}

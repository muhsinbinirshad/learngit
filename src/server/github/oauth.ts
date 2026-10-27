import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import type { ServerConfig } from '../config'
import type { Store } from '../domain/store'
import { audit } from '../domain/audit'
import type { GitHubClient } from './client'
import { storeUserToken } from './tokens'
import type { User } from '../domain/types'

/**
 * "Sign in with GitHub" via the App's user-authorization flow. State is a stateless HMAC token so
 * we can verify the callback came from a request we initiated (CSRF protection) without a session.
 */

export function createState(secret: string): string {
  const nonce = randomBytes(16).toString('hex')
  const mac = createHmac('sha256', secret).update(nonce).digest('hex')
  return `${nonce}.${mac}`
}

export function verifyState(secret: string, state: string): boolean {
  const [nonce, mac] = state.split('.')
  if (!nonce || !mac) return false
  const expected = createHmac('sha256', secret).update(nonce).digest('hex')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function authorizeUrl(config: ServerConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: `${config.baseUrl}/auth/github/callback`,
    state,
  })
  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

/**
 * Handle the OAuth callback: verify state, exchange the code for tokens, upsert the user, and store
 * the (encrypted) tokens server-side. Returns the user. The browser only ever receives a session id
 * (set by the caller), never the GitHub token.
 */
export async function handleCallback(
  deps: { config: ServerConfig; client: GitHubClient; store: Store },
  input: { code: string; state: string },
): Promise<User> {
  if (!verifyState(deps.config.githubClientSecret, input.state)) {
    throw new Error('invalid oauth state')
  }
  const { tokens, user: ghUser } = await deps.client.exchangeOAuthCode(input.code)
  const existing = await deps.store.getUserByGithubId(ghUser.id)
  const user: User = existing ?? {
    id: randomUUID(),
    githubLogin: ghUser.login,
    githubUserId: ghUser.id,
    role: 'learner',
    createdAt: new Date().toISOString(),
  }
  await deps.store.upsertUser({ ...user, githubLogin: ghUser.login })
  await storeUserToken(deps.store, deps.config.tokenEncryptionKey, user.id, tokens)
  await audit(deps.store, 'user.signed_in', user.id, { login: ghUser.login })
  return user
}

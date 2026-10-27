import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Store } from '../domain/store'
import type { GitHubClient } from './client'
import type { OAuthTokens } from './types'

/**
 * Token handling. User and installation tokens live only on the server, encrypted at rest with
 * AES-256-GCM, and are never sent to or stored in the browser. The database sees only ciphertext.
 */

const ALGO = 'aes-256-gcm'

function key(keyHex: string): Buffer {
  const k = Buffer.from(keyHex, 'hex')
  if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  return k
}

/** Encrypt to `iv:authTag:ciphertext`, all hex. GCM gives us tamper detection on decrypt. */
export function encryptToken(keyHex: string, plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key(keyHex), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`
}

export function decryptToken(keyHex: string, blob: string): string {
  const [ivHex, tagHex, ctHex] = blob.split(':')
  if (!ivHex || !tagHex || !ctHex) throw new Error('malformed token ciphertext')
  const decipher = createDecipheriv(ALGO, key(keyHex), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
}

function expiresAtFrom(expiresInSeconds: number | null): string | null {
  return expiresInSeconds == null ? null : new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}

/** Encrypt and persist a user's OAuth tokens. */
export async function storeUserToken(store: Store, keyHex: string, userId: string, tokens: OAuthTokens): Promise<void> {
  await store.putToken({
    userId,
    kind: 'user',
    ciphertext: encryptToken(keyHex, tokens.accessToken),
    refreshCiphertext: tokens.refreshToken ? encryptToken(keyHex, tokens.refreshToken) : null,
    expiresAt: expiresAtFrom(tokens.expiresInSeconds),
  })
}

/**
 * Return a usable access token for a user, refreshing it first when it is within `skewSeconds` of
 * expiry and a refresh token is available. The refreshed token is re-encrypted and persisted.
 */
export async function getValidUserToken(
  store: Store,
  client: GitHubClient,
  keyHex: string,
  userId: string,
  skewSeconds = 120,
): Promise<string | null> {
  const rec = await store.getToken(userId, 'user')
  if (!rec) return null
  const expiringSoon = rec.expiresAt != null && Date.parse(rec.expiresAt) - Date.now() < skewSeconds * 1000
  if (expiringSoon && rec.refreshCiphertext) {
    const refresh = decryptToken(keyHex, rec.refreshCiphertext)
    const refreshed = await client.refreshOAuthToken(refresh)
    await storeUserToken(store, keyHex, userId, refreshed)
    return refreshed.accessToken
  }
  return decryptToken(keyHex, rec.ciphertext)
}

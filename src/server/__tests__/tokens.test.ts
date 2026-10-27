import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken, storeUserToken, getValidUserToken } from '../github/tokens'
import { createMemoryStore } from '../domain/memoryStore'
import { FakeGitHub } from '../github/fakeClient'

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' // 32 bytes hex

describe('token encryption', () => {
  it('round-trips a token and never stores plaintext', () => {
    const blob = encryptToken(KEY, 'ghu_supersecret')
    expect(blob).not.toContain('ghu_supersecret')
    expect(blob.split(':')).toHaveLength(3) // iv:tag:ciphertext
    expect(decryptToken(KEY, blob)).toBe('ghu_supersecret')
  })

  it('detects tampering (GCM auth tag) and rejects', () => {
    const blob = encryptToken(KEY, 'ghu_secret')
    const [iv, tag, ct] = blob.split(':')
    const flipped = ct!.slice(0, -1) + (ct!.slice(-1) === 'a' ? 'b' : 'a')
    expect(() => decryptToken(KEY, `${iv}:${tag}:${flipped}`)).toThrow()
  })

  it('rejects a key of the wrong length', () => {
    expect(() => encryptToken('abcd', 'x')).toThrow(/32 bytes/)
  })

  it('refreshes a user token that is about to expire', async () => {
    const store = createMemoryStore()
    const client = new FakeGitHub()
    await storeUserToken(store, KEY, 'u1', { accessToken: 'ghu_octo_access', refreshToken: 'ghr_octo_refresh', expiresInSeconds: 10, scopes: [] })
    const token = await getValidUserToken(store, client, KEY, 'u1')
    expect(token).toMatch(/_access2$/) // the refreshed token
    const stored = await store.getToken('u1', 'user')
    expect(decryptToken(KEY, stored!.ciphertext)).toBe(token)
  })

  it('returns the stored token unchanged when it is not near expiry', async () => {
    const store = createMemoryStore()
    const client = new FakeGitHub()
    await storeUserToken(store, KEY, 'u2', { accessToken: 'ghu_fresh', refreshToken: 'ghr_x', expiresInSeconds: 3600, scopes: [] })
    expect(await getValidUserToken(store, client, KEY, 'u2')).toBe('ghu_fresh')
  })
})

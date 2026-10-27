import { describe, it, expect } from 'vitest'
import { createState, verifyState, authorizeUrl, handleCallback } from '../github/oauth'
import { createMemoryStore } from '../domain/memoryStore'
import { FakeGitHub } from '../github/fakeClient'
import { decryptToken } from '../github/tokens'
import { testConfig } from './helpers'

describe('OAuth sign-in', () => {
  it('state round-trips and rejects tampering (CSRF protection)', () => {
    const state = createState('secret')
    expect(verifyState('secret', state)).toBe(true)
    expect(verifyState('secret', state.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBe(false)
    expect(verifyState('other-secret', state)).toBe(false)
  })

  it('authorizeUrl carries client id, redirect and state', () => {
    const config = testConfig()
    const url = new URL(authorizeUrl(config, 'st8'))
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('state')).toBe('st8')
    expect(url.searchParams.get('redirect_uri')).toBe('https://commitlab.test/auth/github/callback')
  })

  it('callback with a bad state is rejected', async () => {
    const config = testConfig()
    const client = new FakeGitHub()
    const store = createMemoryStore()
    await expect(handleCallback({ config, client, store }, { code: 'c', state: 'forged' })).rejects.toThrow(/state/)
  })

  it('callback exchanges the code, creates the user and stores the token encrypted', async () => {
    const config = testConfig()
    const client = new FakeGitHub()
    const store = createMemoryStore()
    client.registerOAuthCode('code123', { login: 'octo-learner', id: 42 })
    const state = createState(config.githubClientSecret)

    const user = await handleCallback({ config, client, store }, { code: 'code123', state })
    expect(user.githubLogin).toBe('octo-learner')

    const stored = await store.getToken(user.id, 'user')
    expect(stored).toBeTruthy()
    expect(stored!.ciphertext).not.toContain('access') // ciphertext, not plaintext
    expect(decryptToken(config.tokenEncryptionKey, stored!.ciphertext)).toBe('ghu_octo-learner_access')
  })
})

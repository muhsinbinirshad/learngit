import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, verify } from 'node:crypto'
import { appJwt, appManifest, APP_PERMISSIONS, APP_EVENTS } from '../github/app'

describe('GitHub App', () => {
  it('mints a verifiable RS256 app JWT with sane claims', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    const now = 1_700_000_000
    const jwt = appJwt(pem, '123456', now)

    const [header, payload, sig] = jwt.split('.')
    const signingInput = `${header}.${payload}`
    const sigBuf = Buffer.from(sig!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    expect(verify('RSA-SHA256', Buffer.from(signingInput), publicKey, sigBuf)).toBe(true)

    const claims = JSON.parse(Buffer.from(payload!, 'base64').toString())
    expect(claims.iss).toBe('123456')
    expect(claims.iat).toBe(now - 60) // backdated for clock skew
    expect(claims.exp).toBe(now + 600)
  })

  it('requests least-privilege, justified permissions', () => {
    // read-only where we only read; administration write is scoped + justified
    const checks = Object.fromEntries(APP_PERMISSIONS.map((p) => [p.permission, p]))
    expect(checks.checks!.access).toBe('read')
    expect(checks.actions!.access).toBe('read')
    expect(checks.administration!.access).toBe('write')
    expect(checks.administration!.why).toMatch(/branch protection/i)
    for (const p of APP_PERMISSIONS) expect(p.why.length).toBeGreaterThan(10) // every permission justified
  })

  it('manifest points the webhook and callback at the base url and subscribes to the needed events', () => {
    const m = appManifest('https://commitlab.test')
    expect(m.hook_attributes.url).toBe('https://commitlab.test/webhooks/github')
    expect(m.redirect_url).toBe('https://commitlab.test/auth/github/callback')
    expect(m.default_events).toEqual(APP_EVENTS)
    expect(m.public).toBe(false)
  })
})

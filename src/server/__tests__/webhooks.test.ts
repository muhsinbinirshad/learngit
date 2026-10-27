import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifySignature, WebhookReceiver } from '../github/webhooks'
import { createMemoryStore } from '../domain/memoryStore'

const SECRET = 'webhook-secret'
function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')
}
function req(body: string, { sig, delivery = 'd1', event = 'push' }: { sig?: string; delivery?: string; event?: string } = {}) {
  return { headers: { 'x-hub-signature-256': sig ?? sign(body), 'x-github-delivery': delivery, 'x-github-event': event }, rawBody: body }
}

describe('webhook signature verification', () => {
  it('accepts a correct signature and rejects a wrong one', () => {
    expect(verifySignature(SECRET, 'hello', sign('hello'))).toBe(true)
    expect(verifySignature(SECRET, 'hello', 'sha256=deadbeef')).toBe(false)
    expect(verifySignature(SECRET, 'hello', undefined)).toBe(false)
    expect(verifySignature(SECRET, 'hello', sign('tampered'))).toBe(false)
  })
})

describe('WebhookReceiver', () => {
  it('processes a valid delivery once and drops replays', async () => {
    const store = createMemoryStore()
    const receiver = new WebhookReceiver(SECRET, store)
    const body = JSON.stringify({ action: 'opened' })
    const first = await receiver.receive(req(body, { delivery: 'abc' }))
    expect(first.status).toBe('ok')
    const replay = await receiver.receive(req(body, { delivery: 'abc' }))
    expect(replay.status).toBe('duplicate')
  })

  it('rejects an invalid signature before parsing', async () => {
    const store = createMemoryStore()
    const receiver = new WebhookReceiver(SECRET, store)
    const out = await receiver.receive(req('{}', { sig: 'sha256=00' }))
    expect(out.status).toBe('invalid_signature')
  })

  it('reports malformed deliveries (missing headers / bad json)', async () => {
    const store = createMemoryStore()
    const receiver = new WebhookReceiver(SECRET, store)
    const noHeaders = await receiver.receive({ headers: { 'x-hub-signature-256': sign('{}') }, rawBody: '{}' })
    expect(noHeaders.status).toBe('malformed')
    const badJson = await receiver.receive(req('not json', { delivery: 'z' }))
    expect(badJson.status).toBe('malformed')
  })
})

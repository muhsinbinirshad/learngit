import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Store } from '../domain/store'
import { audit } from '../domain/audit'

/**
 * Webhook receiver. Every delivery is (1) signature-verified against the App's webhook secret,
 * (2) deduplicated by delivery id (idempotent handlers), and (3) replay-protected: a delivery id we
 * have already processed is dropped. The raw body must be the exact bytes GitHub sent — verify
 * before parsing JSON.
 */

/** Timing-safe verification of the X-Hub-Signature-256 header (`sha256=<hex>`). */
export function verifySignature(secret: string, rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface WebhookRequest {
  headers: Record<string, string | undefined>
  rawBody: string
}

export interface WebhookDelivery {
  event: string
  deliveryId: string
  payload: Record<string, unknown>
}

export type WebhookOutcome = { status: 'ok'; delivery: WebhookDelivery } | { status: 'invalid_signature' } | { status: 'duplicate' } | { status: 'malformed' }

export class WebhookReceiver {
  constructor(
    private readonly secret: string,
    private readonly store: Store,
  ) {}

  async receive(req: WebhookRequest): Promise<WebhookOutcome> {
    const sig = req.headers['x-hub-signature-256']
    if (!verifySignature(this.secret, req.rawBody, sig)) return { status: 'invalid_signature' }

    const deliveryId = req.headers['x-github-delivery']
    const event = req.headers['x-github-event']
    if (!deliveryId || !event) return { status: 'malformed' }

    // Idempotency + replay protection: a delivery id we have seen is never processed twice.
    if (await this.store.seenDelivery(deliveryId)) return { status: 'duplicate' }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(req.rawBody) as Record<string, unknown>
    } catch {
      return { status: 'malformed' }
    }

    await this.store.markDelivery(deliveryId, new Date().toISOString())
    await audit(this.store, 'webhook.received', null, { event, deliveryId })
    return { status: 'ok', delivery: { event, deliveryId, payload } }
  }
}

import { randomUUID } from 'node:crypto'
import type { Store } from './store'
import type { AuditEntry } from './types'

/** Append an audit entry. Detail must be non-sensitive — never pass tokens or secrets. */
export async function audit(store: Store, action: string, actorId: string | null, detail: AuditEntry['detail'] = {}): Promise<void> {
  await store.appendAudit({ id: randomUUID(), at: new Date().toISOString(), actorId, action, detail })
}

import type { Invoice, InvoiceStatus } from '@ledgerly/shared'

/** Allowed invoice status transitions. A paid or void invoice is terminal. */
const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['paid', 'void'],
  paid: [],
  void: [],
}

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function transition(invoice: Invoice, to: InvoiceStatus): Invoice {
  if (!canTransition(invoice.status, to)) {
    throw new Error(`illegal transition ${invoice.status} → ${to}`)
  }
  return { ...invoice, status: to }
}

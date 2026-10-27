import { formatMoney, isOverdue, type Invoice, type Money } from '@ledgerly/shared'

export interface InvoiceRow {
  id: string
  customer: string
  status: string
  due: string
  total: string
}

/** Shape one invoice for the list UI. `total` is the formatted grand total. */
export function toRow(invoice: Invoice, grandTotal: Money, today: string): InvoiceRow {
  const overdue = invoice.status === 'sent' && isOverdue(invoice.dueOn, today)
  return {
    id: invoice.id,
    customer: invoice.customer,
    status: overdue ? 'overdue' : invoice.status,
    due: invoice.dueOn,
    total: formatMoney(grandTotal),
  }
}

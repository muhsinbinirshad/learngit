import type { Money } from './money.ts'

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

export interface LineItem {
  description: string
  /** Integer quantity. */
  quantity: number
  /** Unit price in minor units. */
  unitPrice: Money
}

export interface Invoice {
  id: string
  customer: string
  currency: string
  status: InvoiceStatus
  /** ISO day the invoice was issued. */
  issuedOn: string
  /** ISO day payment is due. */
  dueOn: string
  lineItems: LineItem[]
  /** Tax rate as a percentage, e.g. 7.5 for 7.5%. */
  taxPercent: number
}

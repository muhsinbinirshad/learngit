import { money, sumMoney, percentOf, addMoney, type Money, type Invoice, type LineItem } from '@ledgerly/shared'

/** Subtotal before tax: sum of quantity × unit price for every line. */
export function subtotal(invoice: Invoice): Money {
  const lines = invoice.lineItems.map((li) => lineTotal(li))
  return sumMoney(lines, invoice.currency)
}

export function lineTotal(li: LineItem): Money {
  if (!Number.isInteger(li.quantity) || li.quantity < 0) throw new RangeError('quantity must be a non-negative integer')
  return money(li.unitPrice.amount * li.quantity, li.unitPrice.currency)
}

export function tax(invoice: Invoice): Money {
  return percentOf(subtotal(invoice), invoice.taxPercent)
}

/** Grand total = subtotal + tax, exact in minor units. */
export function total(invoice: Invoice): Money {
  return addMoney(subtotal(invoice), tax(invoice))
}

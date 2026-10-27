import { test } from 'node:test'
import assert from 'node:assert/strict'
import { money, type Invoice } from '@ledgerly/shared'
import { subtotal, tax, total, lineTotal } from './invoice.ts'

function fixture(): Invoice {
  return {
    id: 'INV-1001',
    customer: 'Northwind Traders',
    currency: 'USD',
    status: 'draft',
    issuedOn: '2025-03-01',
    dueOn: '2025-03-31',
    taxPercent: 7.5,
    lineItems: [
      { description: 'Design retainer', quantity: 1, unitPrice: money(120000, 'USD') },
      { description: 'Support hours', quantity: 3, unitPrice: money(9000, 'USD') },
    ],
  }
}

test('subtotal sums line totals exactly', () => {
  assert.equal(subtotal(fixture()).amount, 120000 + 3 * 9000) // 147000
})

test('lineTotal rejects bad quantities', () => {
  assert.throws(() => lineTotal({ description: 'x', quantity: 1.5, unitPrice: money(100, 'USD') }), RangeError)
})

test('tax and total are exact in minor units', () => {
  const inv = fixture()
  assert.equal(tax(inv).amount, Math.round(147000 * 7.5 / 100)) // 11025
  assert.equal(total(inv).amount, 147000 + 11025) // 158025
})

test('total of an empty-but-priced invoice is zero', () => {
  const inv = { ...fixture(), lineItems: [{ description: 'free', quantity: 0, unitPrice: money(5000, 'USD') }], taxPercent: 0 }
  assert.equal(total(inv).amount, 0)
})

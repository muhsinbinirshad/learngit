import { test } from 'node:test'
import assert from 'node:assert/strict'
import { money, type Invoice } from '@ledgerly/shared'
import { toRow } from './formatInvoice.ts'

const inv: Invoice = {
  id: 'INV-1001', customer: 'Northwind', currency: 'USD', status: 'sent',
  issuedOn: '2025-03-01', dueOn: '2025-03-31', taxPercent: 0, lineItems: [],
}

test('toRow formats the total and keeps the status when not overdue', () => {
  const row = toRow(inv, money(158025, 'USD'), '2025-03-10')
  assert.equal(row.total, '$1,580.25')
  assert.equal(row.status, 'sent')
})

test('toRow marks a sent invoice overdue past its due date', () => {
  const row = toRow(inv, money(0, 'USD'), '2025-04-01')
  assert.equal(row.status, 'overdue')
})

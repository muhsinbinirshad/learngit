import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Invoice } from '@ledgerly/shared'
import { canTransition, transition } from './status.ts'

const base: Invoice = {
  id: 'INV-1', customer: 'Acme', currency: 'USD', status: 'draft',
  issuedOn: '2025-01-01', dueOn: '2025-01-31', taxPercent: 0, lineItems: [],
}

test('legal transitions are allowed', () => {
  assert.equal(canTransition('draft', 'sent'), true)
  assert.equal(canTransition('sent', 'paid'), true)
  assert.equal(canTransition('draft', 'void'), true)
})

test('illegal transitions are rejected', () => {
  assert.equal(canTransition('paid', 'sent'), false)
  assert.equal(canTransition('draft', 'paid'), false)
  assert.throws(() => transition({ ...base, status: 'paid' }, 'sent'), /illegal transition/)
})

test('transition returns a new invoice, leaving the original untouched', () => {
  const sent = transition(base, 'sent')
  assert.equal(sent.status, 'sent')
  assert.equal(base.status, 'draft')
})

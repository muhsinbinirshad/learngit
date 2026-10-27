import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isIsoDay, addDays, daysBetween, isOverdue } from './date.ts'

test('isIsoDay validates real calendar days', () => {
  assert.equal(isIsoDay('2025-02-28'), true)
  assert.equal(isIsoDay('2025-02-30'), false) // not a real day
  assert.equal(isIsoDay('2025-13-01'), false)
  assert.equal(isIsoDay('25-01-01'), false)
})

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2025-01-31', 1), '2025-02-01')
  assert.equal(addDays('2025-12-31', 1), '2026-01-01')
  assert.equal(addDays('2025-03-01', -1), '2025-02-28')
})

test('daysBetween and isOverdue', () => {
  assert.equal(daysBetween('2025-01-01', '2025-01-31'), 30)
  assert.equal(isOverdue('2025-01-15', '2025-01-16'), true)
  assert.equal(isOverdue('2025-01-15', '2025-01-15'), false)
})

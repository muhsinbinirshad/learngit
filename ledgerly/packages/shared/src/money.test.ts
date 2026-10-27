import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toMinor, money, addMoney, sumMoney, percentOf, formatMoney, minorUnitDigits } from './money.ts'

test('toMinor rounds major units to integer minor units', () => {
  assert.equal(toMinor(1.23, 'USD'), 123)
  assert.equal(toMinor(19.99, 'USD'), 1999)
  assert.equal(toMinor(1000, 'JPY'), 1000) // zero-decimal currency
})

test('money rejects non-integer amounts', () => {
  assert.throws(() => money(1.5, 'USD'), TypeError)
})

test('addMoney and sumMoney stay exact in integers', () => {
  assert.deepEqual(addMoney(money(10, 'USD'), money(20, 'USD')), { amount: 30, currency: 'USD' })
  assert.deepEqual(sumMoney([money(10, 'USD'), money(20, 'USD'), money(5, 'USD')], 'USD'), { amount: 35, currency: 'USD' })
})

test('addMoney refuses mixed currencies', () => {
  assert.throws(() => addMoney(money(1, 'USD'), money(1, 'EUR')), RangeError)
})

test('percentOf rounds to the nearest minor unit', () => {
  assert.equal(percentOf(money(1999, 'USD'), 7.5).amount, 150)
})

test('formatMoney respects minor-unit digits', () => {
  assert.equal(minorUnitDigits('JPY'), 0)
  assert.equal(formatMoney(money(123456, 'USD')), '$1,234.56')
  assert.equal(formatMoney(money(1000, 'JPY')), '¥1,000')
})

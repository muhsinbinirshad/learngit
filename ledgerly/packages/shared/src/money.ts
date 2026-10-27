/**
 * Money is stored in minor units (cents) as integers. Never use floats for money: 0.1 + 0.2 is
 * not 0.3 in IEEE-754, and rounding drift corrupts invoice totals. All math here stays in integers.
 */

export interface Money {
  /** Integer amount in the currency's minor unit (e.g. cents). */
  amount: number
  /** ISO 4217 code, e.g. "USD", "EUR", "JPY". */
  currency: string
}

/** Currencies with no minor unit (amount is already the whole value). */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'CLP', 'VND'])

export function minorUnitDigits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

/** Convert a major-unit value (e.g. dollars) to integer minor units. */
export function toMinor(major: number, currency: string): number {
  const factor = 10 ** minorUnitDigits(currency)
  return Math.round(major * factor)
}

export function money(amount: number, currency: string): Money {
  if (!Number.isInteger(amount)) throw new TypeError('Money.amount must be an integer in minor units')
  return { amount, currency: currency.toUpperCase() }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return { amount: a.amount + b.amount, currency: a.currency }
}

export function sumMoney(items: Money[], currency: string): Money {
  let total = 0
  for (const m of items) {
    if (m.currency !== currency.toUpperCase()) throw new RangeError(`cannot sum ${m.currency} into ${currency}`)
    total += m.amount
  }
  return { amount: total, currency: currency.toUpperCase() }
}

/** Apply a percentage (e.g. 7.5 for 7.5%) and round to the nearest minor unit. */
export function percentOf(m: Money, percent: number): Money {
  return { amount: Math.round((m.amount * percent) / 100), currency: m.currency }
}

export function formatMoney(m: Money): string {
  const digits = minorUnitDigits(m.currency)
  const value = m.amount / 10 ** digits
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency, minimumFractionDigits: digits }).format(value)
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new RangeError(`currency mismatch: ${a.currency} vs ${b.currency}`)
}

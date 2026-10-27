/** Invoice dates are plain calendar days (no time zone). Stored and compared as `YYYY-MM-DD`. */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDay(s: string): boolean {
  if (!ISO_DAY.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function addDays(isoDay: string, days: number): string {
  if (!isIsoDay(isoDay)) throw new RangeError(`not an ISO day: ${isoDay}`)
  const d = new Date(`${isoDay}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  return Math.round((db - da) / 86_400_000)
}

/** An invoice is overdue when `today` is strictly past its due date. */
export function isOverdue(dueDay: string, today: string): boolean {
  return daysBetween(dueDay, today) > 0
}

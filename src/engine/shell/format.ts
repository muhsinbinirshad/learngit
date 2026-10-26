/** ANSI helpers for terminal output. Kept minimal and consistent with git's default colors. */
export const ansi = {
  reset: '\x1b[0m',
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  boldRed: (s: string) => `\x1b[1;31m${s}\x1b[0m`,
  boldGreen: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
  boldCyan: (s: string) => `\x1b[1;36m${s}\x1b[0m`,
  boldYellow: (s: string) => `\x1b[1;33m${s}\x1b[0m`,
  boldMagenta: (s: string) => `\x1b[1;35m${s}\x1b[0m`,
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** git's default date format: "Mon Jan 5 14:03:12 2026 +0000" */
export function gitDate(timestampSeconds: number): string {
  const d = new Date(timestampSeconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`
}

export function relativeDate(timestampSeconds: number, nowSeconds: number): string {
  const diff = Math.max(0, nowSeconds - timestampSeconds)
  if (diff < 60) return `${diff} seconds ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} days ago`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} months ago`
  return `${Math.floor(diff / (86400 * 365))} years ago`
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

/** POSIX path helpers (no node dependency so they run in the browser). */
export function normalize(p: string): string {
  const abs = p.startsWith('/')
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (parts.length) parts.pop()
      continue
    }
    parts.push(seg)
  }
  const out = parts.join('/')
  return abs ? '/' + out : out || '.'
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join('/'))
}

export function resolve(cwd: string, p: string): string {
  if (!p) return normalize(cwd)
  return p.startsWith('/') ? normalize(p) : normalize(cwd + '/' + p)
}

export function dirname(p: string): string {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  if (i < 0) return '.'
  if (i === 0) return '/'
  return n.slice(0, i)
}

export function basename(p: string): string {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  return i < 0 ? n : n.slice(i + 1)
}

/** Path of `target` relative to directory `base`; both absolute. Returns '.' when equal. */
export function relative(base: string, target: string): string {
  const b = normalize(base).split('/').filter(Boolean)
  const t = normalize(target).split('/').filter(Boolean)
  let i = 0
  while (i < b.length && i < t.length && b[i] === t[i]) i++
  const up = b.slice(i).map(() => '..')
  const rest = t.slice(i)
  const out = [...up, ...rest].join('/')
  return out || '.'
}

export function isInside(base: string, target: string): boolean {
  const b = normalize(base)
  const t = normalize(target)
  return t === b || t.startsWith(b.endsWith('/') ? b : b + '/')
}

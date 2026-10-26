import { structuredPatch } from 'diff'
import type { Repo } from './repo'
import { readFlatTree, readIndex, type FlatTree } from './tree'
import { readTextOrNull } from '../fs'
import { computeStatus } from './worktree'

export interface FileDiff {
  path: string
  oldPath?: string
  status: 'added' | 'deleted' | 'modified'
  oldText: string
  newText: string
  hunks: ReturnType<typeof structuredPatch>['hunks']
  insertions: number
  deletions: number
  binary?: boolean
}

export function diffTexts(path: string, oldText: string | null, newText: string | null, context = 3): FileDiff {
  const a = oldText ?? ''
  const b = newText ?? ''
  const patch = structuredPatch(path, path, a, b, '', '', { context })
  let ins = 0
  let del = 0
  for (const h of patch.hunks) {
    for (const l of h.lines) {
      if (l.startsWith('+')) ins++
      else if (l.startsWith('-')) del++
    }
  }
  return {
    path,
    status: oldText === null ? 'added' : newText === null ? 'deleted' : 'modified',
    oldText: a,
    newText: b,
    hunks: patch.hunks,
    insertions: ins,
    deletions: del,
  }
}

/** Diff two flat trees (commit vs commit). */
export async function diffFlatTreeContents(repo: Repo, a: FlatTree, b: FlatTree, paths?: string[]): Promise<FileDiff[]> {
  const out: FileDiff[] = []
  const all = [...new Set([...a.keys(), ...b.keys()])].sort()
  for (const p of all) {
    if (paths && !paths.some((f) => p === f || p.startsWith(f.replace(/\/$/, '') + '/'))) continue
    const ae = a.get(p)
    const be = b.get(p)
    if (ae?.oid === be?.oid) continue
    const at = ae ? await repo.readBlobText(ae.oid) : null
    const bt = be ? await repo.readBlobText(be.oid) : null
    out.push(diffTexts(p, at, bt))
  }
  return out
}

export async function diffCommits(repo: Repo, fromOid: string | null, toOid: string, paths?: string[]): Promise<FileDiff[]> {
  return diffFlatTreeContents(repo, await readFlatTree(repo, fromOid), await readFlatTree(repo, toOid), paths)
}

/** Worktree vs index (plain `git diff`). */
export async function diffWorktree(repo: Repo, paths?: string[]): Promise<FileDiff[]> {
  const index = await readIndex(repo)
  const status = await computeStatus(repo)
  const out: FileDiff[] = []
  for (const e of status.entries) {
    if (paths && !paths.some((f) => e.path === f || e.path.startsWith(f.replace(/\/$/, '') + '/'))) continue
    if (e.untracked) continue
    if (!e.unstaged && !e.conflicted) continue
    const idx = index.get(e.path)
    const oldText = idx ? await repo.readBlobText(idx.oid) : null
    const newText = await readTextOrNull(repo.fs, `${repo.dir}/${e.path}`)
    if (oldText === newText) continue
    out.push(diffTexts(e.path, oldText, newText))
  }
  return out
}

/** Index vs HEAD (`git diff --staged`). */
export async function diffStaged(repo: Repo, paths?: string[]): Promise<FileDiff[]> {
  const head = await repo.headOid()
  return diffFlatTreeContents(repo, await readFlatTree(repo, head), await readIndex(repo), paths)
}

/** Worktree vs a commit (`git diff <rev>`). */
export async function diffWorktreeAgainst(repo: Repo, commitOid: string, paths?: string[]): Promise<FileDiff[]> {
  const tree = await readFlatTree(repo, commitOid)
  const index = await readIndex(repo)
  const out: FileDiff[] = []
  const all = new Set([...tree.keys(), ...index.keys()])
  for (const p of [...all].sort()) {
    if (paths && !paths.some((f) => p === f || p.startsWith(f.replace(/\/$/, '') + '/'))) continue
    const te = tree.get(p)
    const oldText = te ? await repo.readBlobText(te.oid) : null
    const newText = await readTextOrNull(repo.fs, `${repo.dir}/${p}`)
    if (oldText === newText) continue
    out.push(diffTexts(p, oldText, newText))
  }
  return out
}

/** Render in git's unified format. `color` adds ANSI escapes for the terminal. */
export function formatUnified(diffs: FileDiff[], color = false): string[] {
  const c = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
  const lines: string[] = []
  for (const d of diffs) {
    lines.push(c('1', `diff --git a/${d.path} b/${d.path}`))
    if (d.status === 'added') lines.push(c('1', 'new file mode 100644'))
    if (d.status === 'deleted') lines.push(c('1', 'deleted file mode 100644'))
    lines.push(c('1', `--- ${d.status === 'added' ? '/dev/null' : 'a/' + d.path}`))
    lines.push(c('1', `+++ ${d.status === 'deleted' ? '/dev/null' : 'b/' + d.path}`))
    for (const h of d.hunks) {
      lines.push(c('36', `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`))
      for (const l of h.lines) {
        if (l.startsWith('+')) lines.push(c('32', l))
        else if (l.startsWith('-')) lines.push(c('31', l))
        else if (l.startsWith('\\')) lines.push(c('90', l))
        else lines.push(l)
      }
    }
  }
  return lines
}

export function formatStat(diffs: FileDiff[]): string[] {
  if (!diffs.length) return []
  const width = Math.max(...diffs.map((d) => d.path.length))
  const lines = diffs.map((d) => {
    const total = d.insertions + d.deletions
    const bar = '+'.repeat(Math.min(d.insertions, 40)) + '-'.repeat(Math.min(d.deletions, 40))
    return ` ${d.path.padEnd(width)} | ${String(total).padStart(3)} ${bar}`
  })
  const files = diffs.length
  const ins = diffs.reduce((s, d) => s + d.insertions, 0)
  const del = diffs.reduce((s, d) => s + d.deletions, 0)
  const parts = [`${files} file${files === 1 ? '' : 's'} changed`]
  if (ins) parts.push(`${ins} insertion${ins === 1 ? '' : 's'}(+)`)
  if (del) parts.push(`${del} deletion${del === 1 ? '' : 's'}(-)`)
  lines.push(' ' + parts.join(', '))
  return lines
}

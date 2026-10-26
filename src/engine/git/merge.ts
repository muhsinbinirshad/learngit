import { merge as diff3Merge } from 'node-diff3'
import type { Repo } from './repo'
import { readFlatTree, type FlatEntry, type FlatTree } from './tree'

export interface MergeConflict {
  path: string
  kind: 'content' | 'modify/delete' | 'add/add'
  /** Which side still has the file when kind is modify/delete. */
  keptSide?: 'ours' | 'theirs'
}

export interface TreeMergeResult {
  tree: FlatTree // merged result (conflicted paths contain conflict markers)
  conflicts: MergeConflict[]
  /** Paths that were touched by the merge relative to `ours` (for clobber checks and summaries). */
  changedFromOurs: string[]
  autoMerged: string[]
}

export interface MergeLabels {
  ours: string
  theirs: string
}

/** Three-way merge of trees. Pure with respect to worktree and refs; only writes blob objects. */
export async function mergeTrees(repo: Repo, baseOid: string | null, oursOid: string, theirsOid: string, labels: MergeLabels): Promise<TreeMergeResult> {
  const base = await readFlatTree(repo, baseOid)
  const ours = await readFlatTree(repo, oursOid)
  const theirs = await readFlatTree(repo, theirsOid)
  return mergeFlatTrees(repo, base, ours, theirs, labels)
}

export async function mergeFlatTrees(repo: Repo, base: FlatTree, ours: FlatTree, theirs: FlatTree, labels: MergeLabels): Promise<TreeMergeResult> {
  const paths = new Set<string>([...base.keys(), ...ours.keys(), ...theirs.keys()])
  const result: FlatTree = new Map()
  const conflicts: MergeConflict[] = []
  const autoMerged: string[] = []

  const same = (a?: FlatEntry, b?: FlatEntry) => (!a && !b) || (!!a && !!b && a.oid === b.oid)

  for (const path of [...paths].sort()) {
    const b = base.get(path)
    const o = ours.get(path)
    const t = theirs.get(path)

    if (same(o, t)) {
      if (o) result.set(path, o)
      continue
    }
    if (same(b, o)) {
      // Only theirs changed (or deleted)
      if (t) result.set(path, t)
      continue
    }
    if (same(b, t)) {
      if (o) result.set(path, o)
      continue
    }
    // Both changed differently.
    if (o && t) {
      const oursText = await repo.readBlobText(o.oid)
      const theirsText = await repo.readBlobText(t.oid)
      const baseText = b ? await repo.readBlobText(b.oid) : ''
      const merged = diff3Merge(oursText, baseText, theirsText, {
        stringSeparator: '\n',
        label: { a: labels.ours, b: labels.theirs },
      })
      const text = merged.result.join('\n')
      const oid = await repo.writeBlob(text)
      result.set(path, { oid, mode: o.mode })
      if (merged.conflict) conflicts.push({ path, kind: b ? 'content' : 'add/add' })
      else autoMerged.push(path)
      continue
    }
    // modify/delete
    if (o && !t) {
      result.set(path, o)
      conflicts.push({ path, kind: 'modify/delete', keptSide: 'ours' })
    } else if (t && !o) {
      result.set(path, t)
      conflicts.push({ path, kind: 'modify/delete', keptSide: 'theirs' })
    }
  }

  const changedFromOurs: string[] = []
  for (const [p, e] of result) {
    const oe = ours.get(p)
    if (!oe || oe.oid !== e.oid) changedFromOurs.push(p)
  }
  for (const p of ours.keys()) if (!result.has(p)) changedFromOurs.push(p)

  return { tree: result, conflicts, changedFromOurs: changedFromOurs.sort(), autoMerged }
}

export const CONFLICT_MARKER_RE = /^(<{7}|={7}|>{7})( |$)/m

export function hasConflictMarkers(text: string): boolean {
  return CONFLICT_MARKER_RE.test(text)
}

export function formatConflictLines(result: TreeMergeResult): string[] {
  const lines: string[] = []
  for (const p of result.autoMerged) lines.push(`Auto-merging ${p}`)
  for (const c of result.conflicts) {
    if (c.kind === 'content') {
      lines.push(`Auto-merging ${c.path}`)
      lines.push(`CONFLICT (content): Merge conflict in ${c.path}`)
    } else if (c.kind === 'add/add') {
      lines.push(`CONFLICT (add/add): Merge conflict in ${c.path}`)
    } else {
      lines.push(
        `CONFLICT (modify/delete): ${c.path} deleted in one branch and modified in the other. Version of ${c.path} from ${c.keptSide === 'ours' ? 'HEAD' : 'the other branch'} left in tree.`,
      )
    }
  }
  return lines
}

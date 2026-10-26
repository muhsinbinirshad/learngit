import type { Repo } from './repo'
import { shortOid, subjectOf } from './repo'
import { fatal } from './errors'
import { mergeTrees, formatConflictLines } from './merge'
import { commitTreeOid, readFlatTree, readIndex, writeFlatTree, type FlatTree } from './tree'
import { applyTreeChange, computeStatus, hardCheckoutTree, stagePath } from './worktree'
import { readTextOrNull } from '../fs'

export interface StashEntry {
  index: number
  oid: string
  message: string
}

/** Tree of the worktree for tracked files (index entries overlaid with worktree content). */
async function worktreeTree(repo: Repo, includeUntracked: boolean): Promise<FlatTree> {
  const index = await readIndex(repo)
  const status = await computeStatus(repo)
  const out: FlatTree = new Map(index)
  for (const e of status.entries) {
    if (e.untracked && !includeUntracked) continue
    if (e.unstaged === 'deleted') {
      out.delete(e.path)
      continue
    }
    if (e.unstaged === 'modified' || e.untracked || e.conflicted) {
      const text = await readTextOrNull(repo.fs, `${repo.dir}/${e.path}`)
      if (text === null) continue
      const oid = await repo.writeBlob(text)
      out.set(e.path, { oid, mode: index.get(e.path)?.mode ?? '100644' })
    }
  }
  return out
}

export async function stashPush(repo: Repo, message?: string, opts: { includeUntracked?: boolean } = {}): Promise<string[]> {
  const head = await repo.headOid()
  if (!head) throw fatal('You do not have the initial commit yet')
  const status = await computeStatus(repo)
  const hasWork = status.staged.length || status.unstaged.length || status.conflicted.length || (opts.includeUntracked && status.untracked.length)
  if (!hasWork) return ['No local changes to save']

  const identity = await repo.identity()
  const now = repo.clock.now()
  const branch = await repo.currentBranch()
  const { commit: headCommit } = await repo.readCommit(head)
  const indexTree = await writeFlatTree(repo, await readIndex(repo))
  const indexCommit = await repo.writeCommit({
    message: `index on ${branch ?? '(no branch)'}: ${shortOid(head)} ${subjectOf(headCommit.message)}\n`,
    tree: indexTree,
    parent: [head],
    author: { ...identity, timestamp: now, timezoneOffset: 0 },
    committer: { ...identity, timestamp: now, timezoneOffset: 0 },
  })
  const wtTree = await writeFlatTree(repo, await worktreeTree(repo, !!opts.includeUntracked))
  const label = `${branch ?? '(no branch)'}: ${shortOid(head)} ${subjectOf(headCommit.message)}`
  const stashMessage = message ? `On ${branch ?? '(no branch)'}: ${message}` : `WIP on ${label}`
  const stashOid = await repo.writeCommit({
    message: stashMessage + '\n',
    tree: wtTree,
    parent: [head, indexCommit],
    author: { ...identity, timestamp: now, timezoneOffset: 0 },
    committer: { ...identity, timestamp: now, timezoneOffset: 0 },
  })
  const prev = await repo.refOid('refs/stash')
  await repo.writeRef('refs/stash', stashOid)
  await repo.appendReflog('refs/stash', prev, stashOid, stashMessage)

  // Clean the worktree back to HEAD.
  await hardCheckoutTree(repo, head)
  if (opts.includeUntracked) {
    const { rmrf } = await import('../fs')
    for (const e of status.untracked) await rmrf(repo.fs, `${repo.dir}/${e.path}`)
  }
  await repo.clearOperationState()
  return [`Saved working directory and index state ${stashMessage}`]
}

export async function stashList(repo: Repo): Promise<StashEntry[]> {
  const entries = await repo.readReflog('refs/stash')
  return entries.map((e, i) => ({ index: i, oid: e.newOid, message: e.message }))
}

function parseStashRef(ref: string | undefined): number {
  if (!ref) return 0
  const m = /^stash@\{(\d+)\}$/.exec(ref)
  if (m) return parseInt(m[1]!, 10)
  if (/^\d+$/.test(ref)) return parseInt(ref, 10)
  throw fatal(`'${ref}' is not a stash reference`)
}

export async function stashApply(repo: Repo, ref: string | undefined, opts: { pop?: boolean; index?: boolean } = {}): Promise<string[]> {
  const idx = parseStashRef(ref)
  const list = await stashList(repo)
  const entry = list[idx]
  if (!entry) throw fatal(list.length ? `Log for 'refs/stash' only has ${list.length} entries.` : 'No stash entries found.')
  const head = (await repo.headOid())!
  const { commit: stashCommit } = await repo.readCommit(entry.oid)
  const base = stashCommit.parent[0]!
  const result = await mergeTrees(repo, base, head, entry.oid, { ours: 'Updated upstream', theirs: 'Stashed changes' })
  const { assertNoClobber } = await import('./worktree')
  await assertNoClobber(repo, result.changedFromOurs, 'merge')

  const oursTree = await readFlatTree(repo, head)
  const conflictPaths = new Set(result.conflicts.map((c) => c.path))
  // Stash apply leaves changes unstaged (unless --index restores the staged state).
  await applyTreeChange(repo, oursTree, result.tree, { stage: false, skip: conflictPaths })
  for (const path of conflictPaths) {
    const e = result.tree.get(path)
    if (e) {
      const { writeFileDeep } = await import('../fs')
      await writeFileDeep(repo.fs, `${repo.dir}/${path}`, await repo.readBlob(e.oid))
    }
  }
  if (opts.index && stashCommit.parent[1]) {
    const indexTree = await readFlatTree(repo, stashCommit.parent[1])
    const headTree = await readFlatTree(repo, head)
    for (const [p, e] of indexTree) {
      if (headTree.get(p)?.oid !== e.oid && !conflictPaths.has(p)) await stagePath(repo, p, true)
    }
  }
  // Newly added files appear as untracked in git after stash apply? No: git stages new files. Mirror that.
  for (const p of result.tree.keys()) {
    if (!oursTree.has(p) && !conflictPaths.has(p)) await stagePath(repo, p, true)
  }

  const lines: string[] = []
  if (conflictPaths.size) {
    await repo.setConflicts([...conflictPaths].sort())
    lines.push(...formatConflictLines(result))
    lines.push(opts.pop ? 'The stash entry is kept in case you need it again.' : '')
    return lines.filter(Boolean)
  }
  const status = await computeStatus(repo)
  lines.push(...formatStatusLikeGit(status))
  if (opts.pop) {
    await stashDrop(repo, `stash@{${idx}}`, lines)
  }
  return lines
}

function formatStatusLikeGit(status: Awaited<ReturnType<typeof computeStatus>>): string[] {
  const lines: string[] = [status.branch ? `On branch ${status.branch}` : 'HEAD detached']
  if (status.staged.length) {
    lines.push('Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)')
    for (const e of status.staged) lines.push(`\t${(e.staged === 'added' ? 'new file' : e.staged!).padEnd(11)}${e.path}`)
    lines.push('')
  }
  if (status.unstaged.length) {
    lines.push(
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)',
    )
    for (const e of status.unstaged) lines.push(`\t${e.unstaged!.padEnd(11)}${e.path}`)
    lines.push('')
  }
  return lines
}

export async function stashDrop(repo: Repo, ref: string | undefined, lines: string[] = []): Promise<string[]> {
  const idx = parseStashRef(ref)
  const entries = await repo.readReflog('refs/stash')
  const entry = entries[idx]
  if (!entry) throw fatal(entries.length ? `Log for 'refs/stash' only has ${entries.length} entries.` : 'No stash entries found.')
  entries.splice(idx, 1)
  const identity = await repo.identity().catch(() => ({ name: 'Commit Lab', email: 'lab@commitlab.local' }))
  await repo.writeReflogAll('refs/stash', entries, identity)
  if (entries.length) await repo.writeRef('refs/stash', entries[0]!.newOid)
  else await repo.deleteRef('refs/stash').catch(() => undefined)
  lines.push(`Dropped refs/stash@{${idx}} (${entry.newOid})`)
  return lines
}

export async function stashClear(repo: Repo): Promise<void> {
  const identity = await repo.identity().catch(() => ({ name: 'Commit Lab', email: 'lab@commitlab.local' }))
  await repo.writeReflogAll('refs/stash', [], identity)
  await repo.deleteRef('refs/stash').catch(() => undefined)
}

export async function stashShow(repo: Repo, ref: string | undefined): Promise<{ oid: string; base: string; tree: string; baseTree: string }> {
  const idx = parseStashRef(ref)
  const list = await stashList(repo)
  const entry = list[idx]
  if (!entry) throw fatal('No stash entries found.')
  const { commit } = await repo.readCommit(entry.oid)
  return { oid: entry.oid, base: commit.parent[0]!, tree: commit.tree, baseTree: await commitTreeOid(repo, commit.parent[0]!) }
}

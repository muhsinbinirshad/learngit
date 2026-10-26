import git from 'isomorphic-git'
import type { Repo } from './repo'
import { shortOid, subjectOf } from './repo'
import { fatal } from './errors'
import { readFlatTree, readIndex } from './tree'
import { hardCheckoutTree, removeFromIndex } from './worktree'

export type ResetMode = 'soft' | 'mixed' | 'hard'

export async function resetTo(repo: Repo, mode: ResetMode, rev: string): Promise<string[]> {
  const head = await repo.headOid()
  if (!head) throw fatal('Failed to resolve HEAD as a valid ref.')
  const target = await repo.resolveRevision(rev)
  await repo.setOrigHead(head)
  await repo.moveHead(target)
  if (mode === 'mixed' || mode === 'hard') {
    if (mode === 'hard') {
      await hardCheckoutTree(repo, target)
    } else {
      await resetIndexToCommit(repo, target)
    }
    await repo.clearOperationState()
  }
  if (mode === 'hard') {
    const { commit } = await repo.readCommit(target)
    return [`HEAD is now at ${shortOid(target)} ${subjectOf(commit.message)}`]
  }
  if (mode === 'mixed') {
    const { computeStatus } = await import('./worktree')
    const status = await computeStatus(repo)
    const lines: string[] = []
    if (status.unstaged.length) {
      lines.push('Unstaged changes after reset:')
      for (const e of status.unstaged) lines.push(`${e.unstaged === 'deleted' ? 'D' : 'M'}\t${e.path}`)
    }
    return lines
  }
  return []
}

/** Make the index match a commit's tree without touching the worktree. */
export async function resetIndexToCommit(repo: Repo, commitOid: string): Promise<void> {
  const target = await readFlatTree(repo, commitOid)
  const index = await readIndex(repo)
  for (const path of index.keys()) {
    if (!target.has(path)) await removeFromIndex(repo, path)
  }
  for (const [path, entry] of target) {
    const cur = index.get(path)
    if (cur && cur.oid === entry.oid) continue
    await git.resetIndex({ fs: repo.fs, dir: repo.dir, gitdir: repo.gitdir, filepath: path, ref: commitOid, cache: repo.cache })
  }
}

/** `git reset [<rev>] -- <paths>`: copy entries from rev's tree into the index. */
export async function resetPaths(repo: Repo, rev: string, paths: string[]): Promise<void> {
  const target = await repo.resolveRevision(rev)
  const tree = await readFlatTree(repo, target)
  for (const path of paths) {
    if (tree.has(path)) {
      await git.resetIndex({ fs: repo.fs, dir: repo.dir, gitdir: repo.gitdir, filepath: path, ref: target, cache: repo.cache })
    } else {
      try {
        await removeFromIndex(repo, path)
      } catch {
        /* absent */
      }
    }
    await repo.clearConflict(path)
  }
}

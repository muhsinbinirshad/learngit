import git from 'isomorphic-git'
import { exists, readTextOrNull, rmrf, writeFileDeep, dirname } from '../fs'
import type { Repo } from './repo'
import { readFlatTree, readIndex, type FlatTree } from './tree'

export type FileState = 'staged-added' | 'staged-modified' | 'staged-deleted' | 'modified' | 'deleted' | 'untracked' | 'conflicted'

export interface StatusEntry {
  path: string
  /** Index vs HEAD */
  staged: 'added' | 'modified' | 'deleted' | null
  /** Worktree vs index */
  unstaged: 'modified' | 'deleted' | null
  untracked: boolean
  conflicted: boolean
}

export interface RepoStatus {
  branch: string | null
  headOid: string | null
  entries: StatusEntry[]
  staged: StatusEntry[]
  unstaged: StatusEntry[]
  untracked: StatusEntry[]
  conflicted: StatusEntry[]
  clean: boolean
  /** Untracked paths with fully-untracked directories collapsed to `dir/`, as `git status` prints them. */
  untrackedCollapsed: string[]
}

/**
 * Full status computed from content hashes (not stat caches), so edits made within the same
 * millisecond as a `git add` are still detected. Lab repositories are small enough for this.
 */
export async function computeStatus(repo: Repo): Promise<RepoStatus> {
  const head = await readFlatTree(repo, await repo.headOid())
  const index = await readIndex(repo)
  const conflicts = new Set(await repo.getConflicts())
  const { listFilesRecursive, relative } = await import('../fs')
  const worktreeFiles = (await listFilesRecursive(repo.fs, repo.dir, true)).map((f) => relative(repo.dir, f))
  const worktreeSet = new Set(worktreeFiles)
  const paths = new Set<string>([...head.keys(), ...index.keys(), ...worktreeFiles])
  const entries: StatusEntry[] = []
  const ignoredDirs = new Set<string>()

  for (const path of [...paths].sort()) {
    const h = head.get(path)?.oid ?? null
    const i = index.get(path)?.oid ?? null
    let w: string | null = null
    if (worktreeSet.has(path)) {
      const content = (await repo.fs.promises.readFile(`${repo.dir}/${path}`)) as Uint8Array
      w = (await git.hashBlob({ object: content })).oid
    }
    let staged: StatusEntry['staged'] = null
    let unstaged: StatusEntry['unstaged'] = null
    let untracked = false
    if (!h && i) staged = 'added'
    else if (h && !i) staged = 'deleted'
    else if (h && i && h !== i) staged = 'modified'
    if (i && !w) unstaged = 'deleted'
    else if (i && w && i !== w) unstaged = 'modified'
    if (!i && w) {
      // Untracked unless ignored (check the file and its parent directories).
      let ignored = false
      const parts = path.split('/')
      for (let k = 1; k < parts.length; k++) {
        const dir = parts.slice(0, k).join('/')
        if (ignoredDirs.has(dir)) {
          ignored = true
          break
        }
        if (await isIgnored(repo, dir + '/')) {
          ignoredDirs.add(dir)
          ignored = true
          break
        }
      }
      if (!ignored && (await isIgnored(repo, path))) ignored = true
      untracked = !ignored
    }
    const conflicted = conflicts.has(path)
    if (conflicted) {
      staged = null
      unstaged = null
      untracked = false
    }
    if (!staged && !unstaged && !untracked && !conflicted) continue
    entries.push({ path, staged, unstaged, untracked, conflicted })
  }
  const staged = entries.filter((e) => e.staged)
  const unstaged = entries.filter((e) => e.unstaged)
  const untracked = entries.filter((e) => e.untracked)
  const conflicted = entries.filter((e) => e.conflicted)
  return {
    branch: await repo.currentBranch(),
    headOid: await repo.headOid(),
    entries,
    staged,
    unstaged,
    untracked,
    conflicted,
    clean: entries.length === 0,
    untrackedCollapsed: collapseUntracked(
      untracked.map((e) => e.path),
      new Set(index.keys()),
    ),
  }
}

/** Git shows a whole directory as untracked when it contains no tracked files. */
export function collapseUntracked(paths: string[], tracked: Set<string>): string[] {
  const out = new Set<string>()
  for (const p of paths) {
    const parts = p.split('/')
    let collapsed: string | null = null
    for (let k = 1; k < parts.length; k++) {
      const dir = parts.slice(0, k).join('/')
      const hasTracked = [...tracked].some((t) => t.startsWith(dir + '/'))
      if (!hasTracked) {
        collapsed = dir + '/'
        break
      }
    }
    out.add(collapsed ?? p)
  }
  return [...out].sort()
}

export async function isIgnored(repo: Repo, filepath: string): Promise<boolean> {
  try {
    return await git.isIgnored({ fs: repo.fs, dir: repo.dir, gitdir: repo.gitdir, filepath })
  } catch {
    return false
  }
}

/** Stage one path (file) into the index. */
export async function stagePath(repo: Repo, filepath: string, force = false): Promise<void> {
  await git.add({ fs: repo.fs, dir: repo.dir, gitdir: repo.gitdir, filepath, cache: repo.cache, force })
}

export async function unstagePathToHead(repo: Repo, filepath: string): Promise<void> {
  await git.resetIndex({ fs: repo.fs, dir: repo.dir, gitdir: repo.gitdir, filepath, cache: repo.cache })
}

export async function removeFromIndex(repo: Repo, filepath: string): Promise<void> {
  await git.remove({ fs: repo.fs, dir: repo.dir, gitdir: repo.gitdir, filepath, cache: repo.cache })
}

/** Remove empty parent directories up to the repo root. */
async function pruneEmptyDirs(repo: Repo, filepath: string): Promise<void> {
  let dir = dirname(filepath)
  while (dir && dir !== '.' && dir !== '/') {
    const abs = `${repo.dir}/${dir}`
    try {
      const names = await repo.fs.promises.readdir(abs)
      if (names.length) break
      await repo.fs.promises.rmdir(abs)
    } catch {
      break
    }
    dir = dirname(dir)
  }
}

/**
 * Update worktree (and optionally index) so that `from` becomes `to`.
 * Only paths that differ are touched; untracked files are left alone.
 */
export async function applyTreeChange(repo: Repo, from: FlatTree, to: FlatTree, opts: { stage: boolean; skip?: Set<string> } = { stage: true }): Promise<void> {
  for (const [path, entry] of to) {
    if (opts.skip?.has(path)) continue
    const prev = from.get(path)
    if (prev && prev.oid === entry.oid && prev.mode === entry.mode) continue
    const blob = await repo.readBlob(entry.oid)
    await writeFileDeep(repo.fs, `${repo.dir}/${path}`, blob)
    if (opts.stage) await stagePath(repo, path, true)
  }
  for (const path of from.keys()) {
    if (to.has(path) || opts.skip?.has(path)) continue
    await rmrf(repo.fs, `${repo.dir}/${path}`)
    await pruneEmptyDirs(repo, path)
    if (opts.stage) {
      try {
        await removeFromIndex(repo, path)
      } catch {
        /* not in index */
      }
    }
  }
}

/** Make index + worktree exactly match a commit's tree (used by hard reset and checkout --force). */
export async function hardCheckoutTree(repo: Repo, commitOid: string): Promise<void> {
  const index = await readIndex(repo)
  const target = await readFlatTree(repo, commitOid)
  // Also discard worktree modifications of tracked files: rewrite any index path whose worktree content differs.
  await applyTreeChange(repo, index, target, { stage: true })
  for (const [path, entry] of target) {
    const abs = `${repo.dir}/${path}`
    const text = await readTextOrNull(repo.fs, abs)
    const blob = await repo.readBlob(entry.oid)
    const current = text === null ? null : new TextEncoder().encode(text)
    if (!current || !bytesEqual(current, blob)) {
      await writeFileDeep(repo.fs, abs, blob)
      await stagePath(repo, path, true)
    }
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Paths of tracked files with uncommitted changes (staged or not). */
export async function dirtyPaths(repo: Repo): Promise<Set<string>> {
  const status = await computeStatus(repo)
  const set = new Set<string>()
  for (const e of status.entries) if (!e.untracked) set.add(e.path)
  return set
}

/** Throw a git-style error when switching/merging would clobber local changes. */
export async function assertNoClobber(repo: Repo, changedPaths: Iterable<string>, verb: 'checkout' | 'merge'): Promise<void> {
  const dirty = await dirtyPaths(repo)
  const clobbered = [...changedPaths].filter((p) => dirty.has(p))
  const status = await computeStatus(repo)
  const untrackedClobbered = [...changedPaths].filter((p) => status.untracked.some((u) => u.path === p))
  if (clobbered.length) {
    throw new (await import('./errors')).GitError(
      `Your local changes to the following files would be overwritten by ${verb}:\n${clobbered.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you ${verb === 'checkout' ? 'switch branches' : 'merge'}.\nAborting`,
      { prefix: 'error' },
    )
  }
  if (untrackedClobbered.length) {
    throw new (await import('./errors')).GitError(
      `The following untracked working tree files would be overwritten by ${verb}:\n${untrackedClobbered.map((p) => '\t' + p).join('\n')}\nPlease move or remove them before you ${verb === 'checkout' ? 'switch branches' : 'merge'}.\nAborting`,
      { prefix: 'error' },
    )
  }
}

export async function worktreeFileExists(repo: Repo, path: string): Promise<boolean> {
  return exists(repo.fs, `${repo.dir}/${path}`)
}

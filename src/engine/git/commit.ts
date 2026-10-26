import git from 'isomorphic-git'
import type { Repo } from './repo'
import { fatal, gitErr } from './errors'
import { computeStatus } from './worktree'
import { commitTreeOid, readIndex, writeFlatTree } from './tree'

export interface CommitOptions {
  message: string
  /** Extra parents (e.g. MERGE_HEAD). HEAD is always the first parent unless `parents` is given. */
  parents?: string[]
  tree?: string
  author?: { name: string; email: string; timestamp?: number }
  allowEmpty?: boolean
  amend?: boolean
}

export interface CommitResult {
  oid: string
  branch: string | null
  isInitial: boolean
  isMerge: boolean
  summary: { files: number; insertions: number; deletions: number }
}

/** Create a commit from the index (or an explicit tree) and advance HEAD. */
export async function createCommit(repo: Repo, opts: CommitOptions): Promise<CommitResult> {
  const head = await repo.headOid()
  const identity = await repo.identity()
  const now = repo.clock.now()

  if (!opts.message.trim()) throw fatal('Aborting commit due to empty commit message.')

  const conflicts = await repo.getConflicts()
  if (conflicts.length) {
    throw gitErr(
      `Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`,
    )
  }

  let parents: string[]
  let authorSig = { name: identity.name, email: identity.email, timestamp: now, timezoneOffset: 0 }
  if (opts.amend) {
    if (!head) throw fatal('You have nothing to amend.')
    const prev = await repo.readCommit(head)
    parents = prev.commit.parent
    authorSig = { ...prev.commit.author }
  } else {
    parents = opts.parents ?? (head ? [head] : [])
  }
  if (opts.author) {
    authorSig = { name: opts.author.name, email: opts.author.email, timestamp: opts.author.timestamp ?? now, timezoneOffset: 0 }
  }

  const tree = opts.tree ?? (await writeFlatTree(repo, await readIndex(repo)))
  const parentTree = parents[0] ? await commitTreeOid(repo, parents[0]) : null
  if (!opts.allowEmpty && !opts.amend && parents.length <= 1 && tree === parentTree) {
    const status = await computeStatus(repo)
    const hint =
      status.unstaged.length || status.untracked.length
        ? `no changes added to commit (use "git add" and/or "git commit -a")`
        : head
          ? 'nothing to commit, working tree clean'
          : 'nothing to commit (create/copy files and use "git add" to track)'
    throw new (await import('./errors')).GitError(`${formatStatusShortForCommit(status)}${hint}`, { prefix: 'none', exitCode: 1 })
  }

  const oid = await git.writeCommit({
    fs: repo.fs,
    gitdir: repo.gitdir,
    commit: {
      message: opts.message.endsWith('\n') ? opts.message : opts.message + '\n',
      tree,
      parent: parents,
      author: authorSig,
      committer: { name: identity.name, email: identity.email, timestamp: now, timezoneOffset: 0 },
    },
  })
  await repo.moveHead(oid)

  const summary = await diffStat(repo, parentTree, tree)
  return {
    oid,
    branch: await repo.currentBranch(),
    isInitial: parents.length === 0,
    isMerge: parents.length > 1,
    summary,
  }
}

function formatStatusShortForCommit(status: Awaited<ReturnType<typeof computeStatus>>): string {
  const lines: string[] = []
  lines.push(status.branch ? `On branch ${status.branch}` : 'HEAD detached')
  if (status.unstaged.length) {
    lines.push('Changes not staged for commit:')
    for (const e of status.unstaged) lines.push(`\t${e.unstaged}:   ${e.path}`)
  }
  if (status.untracked.length) {
    lines.push('Untracked files:')
    for (const e of status.untracked) lines.push(`\t${e.path}`)
    lines.push('')
  }
  return lines.length ? lines.join('\n') + '\n' : ''
}

/** Count changed files and inserted/deleted lines between two trees. */
export async function diffStat(repo: Repo, fromTree: string | null, toTree: string): Promise<{ files: number; insertions: number; deletions: number }> {
  const { readFlatTree } = await import('./tree')
  const { diffLines } = await import('diff')
  const a = await readFlatTree(repo, fromTree)
  const b = await readFlatTree(repo, toTree)
  let files = 0
  let insertions = 0
  let deletions = 0
  const paths = new Set([...a.keys(), ...b.keys()])
  for (const p of paths) {
    const ae = a.get(p)
    const be = b.get(p)
    if (ae?.oid === be?.oid) continue
    files++
    const at = ae ? await repo.readBlobText(ae.oid) : ''
    const bt = be ? await repo.readBlobText(be.oid) : ''
    for (const part of diffLines(at, bt)) {
      const n = part.count ?? part.value.split('\n').length - (part.value.endsWith('\n') ? 1 : 0)
      if (part.added) insertions += n
      else if (part.removed) deletions += n
    }
  }
  return { files, insertions, deletions }
}

export function formatCommitSummaryLine(result: CommitResult, subject: string): string[] {
  const where = result.branch ?? 'detached HEAD'
  const lines = [`[${where}${result.isInitial ? ' (root-commit)' : ''} ${result.oid.slice(0, 7)}] ${subject}`]
  const s = result.summary
  const parts = [`${s.files} file${s.files === 1 ? '' : 's'} changed`]
  if (s.insertions) parts.push(`${s.insertions} insertion${s.insertions === 1 ? '' : 's'}(+)`)
  if (s.deletions) parts.push(`${s.deletions} deletion${s.deletions === 1 ? '' : 's'}(-)`)
  lines.push(' ' + parts.join(', '))
  return lines
}

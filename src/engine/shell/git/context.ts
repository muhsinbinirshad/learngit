import { exists, relative, isInside, normalize } from '../../fs'
import { Repo } from '../../git/repo'
import { fatal } from '../../git/errors'
import type { CommandContext } from '../types'

/** Find the repository that contains the current directory. */
export async function findRepo(ctx: CommandContext): Promise<Repo> {
  let dir = ctx.cwd
  for (;;) {
    if (await exists(ctx.fs, `${dir}/.git/HEAD`)) return new Repo(ctx.fs, dir, ctx.clock)
    if (dir === '/' || !dir) break
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
  throw fatal('not a git repository (or any of the parent directories): .git')
}

/** Convert a cwd-relative path argument to a repo-relative path. */
export function repoPath(ctx: CommandContext, repo: Repo, p: string): string {
  const abs = ctx.resolve(p)
  if (!isInside(repo.dir, abs)) throw fatal(`${p}: '${p}' is outside repository at '${repo.dir}'`)
  const rel = relative(repo.dir, abs)
  return rel === '.' ? '.' : normalize(rel)
}

/** Repo-relative path to cwd-relative for display. */
export function displayPath(ctx: CommandContext, repo: Repo, repoRel: string): string {
  const rel = relative(ctx.cwd, `${repo.dir}/${repoRel}`)
  return repoRel.endsWith('/') ? rel + '/' : rel
}

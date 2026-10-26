import type { Repo } from './repo'
import { fatal } from './errors'
import { readFlatTree, readIndex, diffFlatTrees } from './tree'
import { applyTreeChange, assertNoClobber, computeStatus } from './worktree'

export interface SwitchResult {
  kind: 'branch' | 'detached' | 'created'
  target: string
  message: string[]
}

/**
 * Switch HEAD to a branch or commit, carrying uncommitted changes along when they do not collide.
 * Mirrors `git switch` / `git checkout <ref>` semantics.
 */
export async function switchTo(
  repo: Repo,
  target: string,
  opts: { create?: string; detach?: boolean; force?: boolean; startPoint?: string } = {},
): Promise<SwitchResult> {
  const head = await repo.headOid()
  const currentBranch = await repo.currentBranch()
  const state = await repo.state()
  if (!opts.force && (state.mergeHead || state.cherryPickHead || state.revertHead || state.rebase)) {
    if (state.conflicts.length) throw fatal(`you need to resolve your current index first`)
  }

  let branchName: string | null = null
  let targetOid: string

  if (opts.create) {
    if (await repo.branchExists(opts.create)) throw fatal(`a branch named '${opts.create}' already exists`)
    validateBranchName(opts.create)
    const start = opts.startPoint ?? 'HEAD'
    targetOid = await repo.resolveRevision(start)
    await repo.writeBranch(opts.create, targetOid)
    branchName = opts.create
  } else if (!opts.detach && (await repo.branchExists(target))) {
    branchName = target
    targetOid = (await repo.refOid(`refs/heads/${target}`))!
  } else {
    // Remote-tracking branch shortcut: `git switch feature` when only origin/feature exists.
    if (!opts.detach) {
      const remotes = await repo.listRemotes()
      for (const { remote } of remotes) {
        const oid = await repo.refOid(`refs/remotes/${remote}/${target}`)
        if (oid) {
          validateBranchName(target)
          await repo.writeBranch(target, oid)
          await repo.setConfig(`branch.${target}.remote`, remote)
          await repo.setConfig(`branch.${target}.merge`, `refs/heads/${target}`)
          branchName = target
          break
        }
      }
    }
    if (!branchName) {
      try {
        targetOid = await repo.resolveRevision(target)
      } catch {
        throw fatal(`invalid reference: ${target}`)
      }
    } else {
      targetOid = (await repo.refOid(`refs/heads/${branchName}`))!
    }
  }

  // Update worktree when the commit changes.
  if (head !== targetOid!) {
    const fromTree = await readFlatTree(repo, head)
    const toTree = await readFlatTree(repo, targetOid!)
    const changed = diffFlatTrees(fromTree, toTree)
    const changedPaths = [...changed.added, ...changed.modified, ...changed.deleted]
    if (opts.force) {
      const index = await readIndex(repo)
      await applyTreeChange(repo, index, toTree, { stage: true })
      // Discard local modifications on tracked files that match the target.
      const status = await computeStatus(repo)
      for (const e of status.entries) {
        if (e.untracked) continue
        const entry = toTree.get(e.path)
        if (entry) {
          const blob = await repo.readBlob(entry.oid)
          await repo.fs.promises.writeFile(`${repo.dir}/${e.path}`, blob)
          await (await import('./worktree')).stagePath(repo, e.path, true)
        }
      }
      await repo.clearOperationState()
    } else {
      await assertNoClobber(repo, changedPaths, 'checkout')
      await applyTreeChange(repo, fromTree, toTree, { stage: true })
    }
  }

  const message: string[] = []
  if (branchName) {
    await repo.attachHead(branchName)
    if (opts.create) message.push(`Switched to a new branch '${branchName}'`)
    else if (branchName === currentBranch) message.push(`Already on '${branchName}'`)
    else message.push(`Switched to branch '${branchName}'`)
    const upstream = await repo.config(`branch.${branchName}.merge`)
    const remote = await repo.config(`branch.${branchName}.remote`)
    if (upstream && remote && !opts.create) {
      const remoteOid = await repo.refOid(`refs/remotes/${remote}/${upstream.replace('refs/heads/', '')}`)
      if (remoteOid && remoteOid === targetOid!) message.push(`Your branch is up to date with '${remote}/${upstream.replace('refs/heads/', '')}'.`)
    }
    return { kind: opts.create ? 'created' : 'branch', target: branchName, message }
  }
  await repo.detachHead(targetOid!)
  const { commit } = await repo.readCommit(targetOid!)
  message.push(
    `Note: switching to '${target}'.`,
    '',
    "You are in 'detached HEAD' state. You can look around, make experimental",
    'changes and commit them, and you can discard any commits you make in this',
    'state without impacting any branches by switching back to a branch.',
    '',
    'If you want to create a new branch to retain commits you create, you may',
    'do so (now or later) by using -c with the switch command. Example:',
    '',
    '  git switch -c <new-branch-name>',
    '',
    `HEAD is now at ${targetOid!.slice(0, 7)} ${commit.message.split('\n')[0]}`,
  )
  return { kind: 'detached', target: targetOid!, message }
}

export function validateBranchName(name: string): void {
  if (
    !name ||
    /[\s~^:?*[\\]/.test(name) ||
    name.startsWith('-') ||
    name.endsWith('/') ||
    name.endsWith('.lock') ||
    name.includes('..') ||
    name.startsWith('/')
  ) {
    throw fatal(`'${name}' is not a valid branch name`)
  }
}

/** Restore files in the worktree and/or index, like `git restore` / `git checkout [<rev>] -- <file>`. */
export async function restorePaths(repo: Repo, paths: string[], opts: { staged?: boolean; worktree?: boolean; source?: string }): Promise<void> {
  const g = (await import('isomorphic-git')).default
  const { stagePath, removeFromIndex } = await import('./worktree')
  const { writeFileDeep, rmrf } = await import('../fs')
  const { GitError } = await import('./errors')
  const head = await repo.headOid()
  const sourceOid = opts.source ? await repo.resolveRevision(opts.source) : null
  const sourceTree = sourceOid ? await readFlatTree(repo, sourceOid) : null
  const headTree = await readFlatTree(repo, head)
  const restoreIndex = !!opts.staged
  const restoreWorktree = opts.worktree ?? !opts.staged

  for (const path of paths) {
    const index = await readIndex(repo)
    const known = index.has(path) || headTree.has(path) || (sourceTree?.has(path) ?? false)
    if (!known) throw new GitError(`pathspec '${path}' did not match any file(s) known to git`, { prefix: 'error' })

    if (restoreIndex) {
      const target = sourceTree ? sourceTree.get(path) : headTree.get(path)
      if (target) {
        await g.resetIndex({ fs: repo.fs, dir: repo.dir, gitdir: repo.gitdir, filepath: path, ref: sourceOid ?? undefined, cache: repo.cache })
      } else {
        try {
          await removeFromIndex(repo, path)
        } catch {
          /* already absent */
        }
      }
      await repo.clearConflict(path)
    }
    if (restoreWorktree) {
      const target = sourceTree ? sourceTree.get(path) : (await readIndex(repo)).get(path)
      if (target) {
        await writeFileDeep(repo.fs, `${repo.dir}/${path}`, await repo.readBlob(target.oid))
        // `git checkout <rev> -- <file>` updates the index as well.
        if (sourceTree && !opts.staged) await stagePath(repo, path, true)
      } else {
        await rmrf(repo.fs, `${repo.dir}/${path}`)
        if (sourceTree && !opts.staged) {
          try {
            await removeFromIndex(repo, path)
          } catch {
            /* absent */
          }
        }
      }
    }
  }
}

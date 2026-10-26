import git from 'isomorphic-git'
import { fatal, gitErr, GitError } from '../../git/errors'
import { shortOid, subjectOf, type Repo } from '../../git/repo'
import { switchTo, validateBranchName, restorePaths } from '../../git/checkout'
import {
  abortMerge,
  abortPick,
  abortRebase,
  cherryPick,
  concludeMerge,
  continuePick,
  continueRebase,
  mergeRef,
  rebase,
  revertCommits,
  skipRebase,
} from '../../git/integrate'
import { resetPaths, resetTo, type ResetMode } from '../../git/reset'
import { stashApply, stashClear, stashDrop, stashList, stashPush, stashShow } from '../../git/stash'
import { computeStatus } from '../../git/worktree'
import { readFlatTree } from '../../git/tree'
import { diffFlatTreeContents, formatStat, formatUnified } from '../../git/diff'
import { aheadBehind, upstreamOf } from '../../git/remote'
import { parseArgs } from '../args'
import { ansi } from '../format'
import type { CommandContext } from '../types'
import { findRepo, repoPath } from './context'
import type { GitSubcommand } from './index'
import { expandPathspec } from './basics'

const LAST_BRANCH_KEY = 'commitlab.lastBranch'

async function rememberBranch(repo: Repo): Promise<void> {
  const b = await repo.currentBranch()
  if (b) await repo.setConfig(LAST_BRANCH_KEY, b)
}

async function resolveDash(repo: Repo, target: string): Promise<string> {
  if (target !== '-') return target
  const prev = await repo.config(LAST_BRANCH_KEY)
  if (!prev) throw fatal(`'-' is not a valid branch name: no previous branch recorded`)
  return prev
}

const branch: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '-a': 'all',
      '--all': 'all',
      '-r': 'remotes',
      '--remotes': 'remotes',
      '-v': 'verbose',
      '-vv': 'verbose',
      '--verbose': 'verbose',
      '-d': 'delete',
      '--delete': 'delete',
      '-D': 'forceDelete',
      '-m': 'move',
      '--move': 'move',
      '-M': 'forceMove',
      '-f': 'force',
      '--force': 'force',
      '--list': 'list',
      '--show-current': 'current',
      '-c': 'copy',
      '--merged': 'merged',
      '--no-merged': 'noMerged',
      '--unset-upstream': 'unsetUpstream',
    },
    values: { '-u': 'upstream', '--set-upstream-to': 'upstream', '-t': 'track', '--track': 'track' },
  })
  const repo = await findRepo(ctx)
  const current = await repo.currentBranch()
  const head = await repo.headOid()

  if (parsed.flags.has('current')) {
    if (current) ctx.out.push(current)
    return
  }
  if (parsed.values['upstream'] !== undefined) {
    const name = parsed.positional[0] ?? current
    if (!name) throw fatal('could not set upstream of HEAD when it does not point to any branch.')
    const up = parsed.values['upstream']
    const slash = up.indexOf('/')
    if (slash < 0) throw fatal(`the requested upstream branch '${up}' does not exist`)
    const remote = up.slice(0, slash)
    const rb = up.slice(slash + 1)
    if (!(await repo.refOid(`refs/remotes/${remote}/${rb}`))) throw fatal(`the requested upstream branch '${up}' does not exist`)
    await repo.setConfig(`branch.${name}.remote`, remote)
    await repo.setConfig(`branch.${name}.merge`, `refs/heads/${rb}`)
    ctx.out.push(`branch '${name}' set up to track '${up}'.`)
    return
  }
  if (parsed.flags.has('unsetUpstream')) {
    const name = parsed.positional[0] ?? current
    if (!name) throw fatal('HEAD does not point to a branch')
    await repo.setConfig(`branch.${name}.remote`, null)
    await repo.setConfig(`branch.${name}.merge`, null)
    return
  }
  if (parsed.flags.has('delete') || parsed.flags.has('forceDelete')) {
    if (!parsed.positional.length) throw fatal('branch name required')
    for (const name of parsed.positional) {
      if (!(await repo.branchExists(name))) throw gitErr(`branch '${name}' not found.`)
      if (name === current) throw gitErr(`cannot delete branch '${name}' used by worktree at '${repo.dir}'`)
      const oid = (await repo.refOid(`refs/heads/${name}`))!
      if (!parsed.flags.has('forceDelete') && head && !(await repo.isAncestor(oid, head))) {
        const up = await upstreamOf(repo, name)
        const upOid = up ? await repo.refOid(up.ref) : null
        if (!(upOid && (await repo.isAncestor(oid, upOid)))) {
          throw gitErr(`the branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'`)
        }
      }
      await repo.deleteBranch(name)
      await repo.setConfig(`branch.${name}.remote`, null).catch(() => undefined)
      await repo.setConfig(`branch.${name}.merge`, null).catch(() => undefined)
      ctx.out.push(`Deleted branch ${name} (was ${shortOid(oid)}).`)
    }
    return
  }
  if (parsed.flags.has('move') || parsed.flags.has('forceMove')) {
    let [oldName, newName] = parsed.positional
    if (!newName) {
      newName = oldName
      oldName = current ?? undefined
    }
    if (!oldName || !newName) throw fatal('branch name required')
    if (!(await repo.branchExists(oldName))) throw gitErr(`refname refs/heads/${oldName} not found`)
    if ((await repo.branchExists(newName)) && !parsed.flags.has('forceMove')) throw fatal(`a branch named '${newName}' already exists`)
    validateBranchName(newName)
    await git.renameBranch({ fs: ctx.fs, gitdir: repo.gitdir, oldref: oldName, ref: newName, checkout: oldName === current })
    const remote = await repo.config(`branch.${oldName}.remote`)
    const merge = await repo.config(`branch.${oldName}.merge`)
    if (remote && merge) {
      await repo.setConfig(`branch.${newName}.remote`, remote)
      await repo.setConfig(`branch.${newName}.merge`, merge)
      await repo.setConfig(`branch.${oldName}.remote`, null)
      await repo.setConfig(`branch.${oldName}.merge`, null)
    }
    return
  }
  if (parsed.positional.length && !parsed.flags.has('list')) {
    const [name, start] = parsed.positional
    if (!name) return
    if ((await repo.branchExists(name)) && !parsed.flags.has('force')) throw fatal(`a branch named '${name}' already exists`)
    validateBranchName(name)
    if (!head && !start) throw fatal(`not a valid object name: '${current ?? 'HEAD'}'`)
    const oid = await repo.resolveRevision(start ?? 'HEAD')
    await repo.writeBranch(name, oid)
    if (start && (await repo.refOid(`refs/remotes/${start}`))) {
      const [remote, ...rest] = start.split('/')
      await repo.setConfig(`branch.${name}.remote`, remote!)
      await repo.setConfig(`branch.${name}.merge`, `refs/heads/${rest.join('/')}`)
      ctx.out.push(`branch '${name}' set up to track '${start}'.`)
    }
    return
  }
  // List
  const branches = await repo.listBranches()
  const showLocal = !parsed.flags.has('remotes')
  const showRemote = parsed.flags.has('all') || parsed.flags.has('remotes')
  let filtered = branches
  if (parsed.flags.has('merged') || parsed.flags.has('noMerged')) {
    const target = head
    const result: string[] = []
    for (const b of branches) {
      const oid = (await repo.refOid(`refs/heads/${b}`))!
      const merged = target ? await repo.isAncestor(oid, target) : false
      if (parsed.flags.has('merged') === merged) result.push(b)
    }
    filtered = result
  }
  if (showLocal) {
    for (const b of filtered) {
      const oid = (await repo.refOid(`refs/heads/${b}`))!
      const isCurrent = b === current
      let line = `${isCurrent ? '* ' : '  '}${isCurrent ? ansi.green(b) : b}`
      if (parsed.flags.has('verbose')) {
        const { commit } = await repo.readCommit(oid)
        const ab = await aheadBehind(repo, b)
        const track = ab ? ` [${ab.upstream}${ab.ahead ? `: ahead ${ab.ahead}` : ''}${ab.behind ? `${ab.ahead ? ', ' : ': '}behind ${ab.behind}` : ''}]` : ''
        line = `${isCurrent ? '* ' : '  '}${(isCurrent ? ansi.green(b) : b).padEnd(isCurrent ? b.length + 9 + 2 : b.length + 2)} ${ansi.yellow(shortOid(oid))}${track} ${subjectOf(commit.message)}`
      }
      ctx.out.push(line)
    }
    if (!current && head) ctx.out.unshift(`* ${ansi.green(`(HEAD detached at ${shortOid(head)})`)}`)
  }
  if (showRemote) {
    for (const { remote } of await repo.listRemotes()) {
      for (const b of await repo.listRemoteBranches(remote)) ctx.out.push(`  ${ansi.red(`remotes/${remote}/${b}`)}`)
    }
  }
}

const switchCmd: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--detach': 'detach',
      '-d': 'detach',
      '-f': 'force',
      '--force': 'force',
      '--discard-changes': 'force',
      '-q': 'quiet',
      '--guess': 'guess',
      '--no-guess': 'noGuess',
    },
    values: { '-c': 'create', '--create': 'create', '-C': 'forceCreate', '--force-create': 'forceCreate', '-t': 'track', '--track': 'track' },
  })
  const repo = await findRepo(ctx)
  const create = parsed.values['create'] ?? parsed.values['forceCreate']
  let target = parsed.positional[0]
  if (!create && !target) throw fatal('missing branch or commit argument')
  if (target) target = await resolveDash(repo, target)
  const from = (await repo.currentBranch()) ?? (await repo.headOid())?.slice(0, 7) ?? 'HEAD'
  if (!create && !parsed.flags.has('detach') && target && !(await repo.branchExists(target))) {
    // switch requires a branch unless --detach; tolerate remote-tracking guesses
    const remoteGuess = (await repo.listRemotes()).some(async () => false)
    void remoteGuess
    let isRemoteBranch = false
    for (const { remote } of await repo.listRemotes()) if (await repo.refOid(`refs/remotes/${remote}/${target}`)) isRemoteBranch = true
    if (!isRemoteBranch) {
      const isCommit = await repo
        .resolveRevision(target)
        .then(() => true)
        .catch(() => false)
      if (isCommit)
        throw fatal(`a branch is expected, got commit '${target}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.`)
      throw fatal(`invalid reference: ${target}`)
    }
  }
  if (parsed.values['forceCreate'] && (await repo.branchExists(parsed.values['forceCreate']))) {
    await repo.deleteBranch(parsed.values['forceCreate'])
  }
  await rememberBranch(repo)
  const result = await switchTo(repo, target ?? 'HEAD', {
    create,
    detach: parsed.flags.has('detach'),
    force: parsed.flags.has('force'),
    startPoint: create ? target : undefined,
  })
  ctx.reflogMessage = `checkout: moving from ${from} to ${result.kind === 'detached' ? shortOid(result.target) : result.target}`
  if (!parsed.flags.has('quiet')) ctx.out.push(...result.message)
  ctx.events.push({ type: 'fs-changed' })
}

const checkout: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--detach': 'detach',
      '-f': 'force',
      '--force': 'force',
      '-q': 'quiet',
      '--ours': 'ours',
      '--theirs': 'theirs',
      '-p': 'patch',
      '--patch': 'patch',
      '--track': 'track',
      '-t': 'track',
    },
    values: { '-b': 'create', '-B': 'forceCreate', '--orphan': 'orphan' },
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('patch')) throw fatal('`git checkout -p` is not available here; use `git restore <file>` or `git add -p`.')
  if (parsed.values['orphan']) throw fatal('`git checkout --orphan` is not available in this environment.')
  const create = parsed.values['create'] ?? parsed.values['forceCreate']
  const from = (await repo.currentBranch()) ?? (await repo.headOid())?.slice(0, 7) ?? 'HEAD'

  if (parsed.flags.has('ours') || parsed.flags.has('theirs')) {
    const paths = [...parsed.positional, ...parsed.afterDashDash]
    if (!paths.length) throw fatal('--ours/--theirs need a path')
    const state = await repo.state()
    const other = state.mergeHead ?? state.cherryPickHead ?? state.revertHead ?? state.rebase?.current?.oid
    if (!other) throw fatal(`'--${parsed.flags.has('ours') ? 'ours' : 'theirs'}' only works during a merge, rebase, cherry-pick or revert`)
    // During rebase the roles are swapped: "ours" is the branch being rebased onto.
    const headOid = (await repo.headOid())!
    const source = parsed.flags.has('ours') ? headOid : other
    const tree = await readFlatTree(repo, source)
    const { writeFileDeep } = await import('../../fs')
    for (const p of paths) {
      const rel = repoPath(ctx, repo, p)
      const entry = tree.get(rel)
      if (!entry) throw gitErr(`path '${rel}' does not have ${parsed.flags.has('ours') ? 'our' : 'their'} version`)
      await writeFileDeep(ctx.fs, `${repo.dir}/${rel}`, await repo.readBlob(entry.oid))
    }
    ctx.events.push({ type: 'fs-changed' })
    return
  }

  // Path restore forms: `git checkout -- <file>` or `git checkout <rev> -- <file>` or `git checkout <file>`
  if (parsed.afterDashDash.length || (!create && parsed.positional.length && !(await isRevision(repo, parsed.positional[0]!)))) {
    let source: string | undefined
    let paths = parsed.afterDashDash
    if (parsed.afterDashDash.length) {
      source = parsed.positional[0]
    } else {
      paths = parsed.positional
    }
    const repoPaths: string[] = []
    for (const p of paths) {
      const expanded = await expandPathspec(ctx, repo, p)
      if (!expanded.length) throw gitErr(`pathspec '${p}' did not match any file(s) known to git`)
      repoPaths.push(...expanded)
    }
    await restorePaths(repo, repoPaths, { source, worktree: true })
    if (source) ctx.out.push(`Updated ${repoPaths.length} path${repoPaths.length === 1 ? '' : 's'} from ${shortOid(await repo.resolveRevision(source))}`)
    else ctx.out.push(`Updated ${repoPaths.length} path${repoPaths.length === 1 ? '' : 's'} from the index`)
    ctx.events.push({ type: 'fs-changed' })
    return
  }

  let target = parsed.positional[0]
  if (!create && !target) {
    ctx.out.push(...(await (await import('./basics')).formatStatusLong(ctx, repo, await computeStatus(repo))))
    return
  }
  if (target) target = await resolveDash(repo, target)
  if (parsed.values['forceCreate'] && (await repo.branchExists(parsed.values['forceCreate']))) await repo.deleteBranch(parsed.values['forceCreate'])
  await rememberBranch(repo)
  const result = await switchTo(repo, target ?? 'HEAD', {
    create,
    detach: parsed.flags.has('detach'),
    force: parsed.flags.has('force'),
    startPoint: create ? target : undefined,
  })
  ctx.reflogMessage = `checkout: moving from ${from} to ${result.kind === 'detached' ? shortOid(result.target) : result.target}`
  if (!parsed.flags.has('quiet')) {
    if (result.kind === 'detached') {
      // git checkout wording differs slightly from git switch
      ctx.out.push(
        ...result.message.map((l) =>
          l
            .replace('by using -c with the switch command', 'by using -c with the switch command')
            .replace('git switch -c <new-branch-name>', 'git switch -c <new-branch-name>'),
        ),
      )
      ctx.out.push('', `Or undo this operation with:`, '', `  git switch -`)
    } else ctx.out.push(...result.message)
  }
  ctx.events.push({ type: 'fs-changed' })
}

async function isRevision(repo: Repo, s: string): Promise<boolean> {
  try {
    await repo.resolveRevision(s)
    return true
  } catch {
    return false
  }
}

const tag: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '-a': 'annotate',
      '--annotate': 'annotate',
      '-d': 'delete',
      '--delete': 'delete',
      '-l': 'list',
      '--list': 'list',
      '-f': 'force',
      '--force': 'force',
      '-n': 'withMessage',
      '-s': 'sign',
    },
    values: { '-m': 'message', '--message': 'message' },
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('delete')) {
    for (const name of parsed.positional) {
      const oid = await repo.refOid(`refs/tags/${name}`)
      if (!oid) throw gitErr(`tag '${name}' not found.`)
      await git.deleteTag({ fs: ctx.fs, gitdir: repo.gitdir, ref: name })
      ctx.out.push(`Deleted tag '${name}' (was ${shortOid(oid)})`)
    }
    return
  }
  if (!parsed.positional.length || parsed.flags.has('list')) {
    const tags = await repo.listTags()
    const pattern = parsed.positional[0]
    const re = pattern ? new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') : null
    for (const t of tags) {
      if (re && !re.test(t)) continue
      if (parsed.flags.has('withMessage')) {
        const oid = (await repo.refOid(`refs/tags/${t}`))!
        const obj = await git.readObject({ fs: ctx.fs, gitdir: repo.gitdir, oid })
        const msg = obj.type === 'tag' ? subjectOf((obj.object as { message: string }).message) : subjectOf((await repo.readCommit(oid)).commit.message)
        ctx.out.push(`${t.padEnd(16)}${msg}`)
      } else ctx.out.push(t)
    }
    return
  }
  const [name, rev] = parsed.positional
  if (!name) return
  if (!/^[\w.\-/]+$/.test(name) || name.startsWith('-')) throw fatal(`'${name}' is not a valid tag name.`)
  if ((await repo.refOid(`refs/tags/${name}`)) && !parsed.flags.has('force')) throw fatal(`tag '${name}' already exists`)
  const oid = await repo.resolveRevision(rev ?? 'HEAD')
  const annotated = parsed.flags.has('annotate') || parsed.values['message'] !== undefined || parsed.flags.has('sign')
  if (annotated) {
    let message = parsed.values['message']
    if (message === undefined) {
      const edited = await ctx.io.openEditor({
        title: 'TAG_EDITMSG',
        content: `\n# Write a message for tag:\n#   ${name}\n# Lines starting with '#' will be ignored.\n`,
        help: 'Describe this tag (for example, release notes).',
      })
      if (edited === null) throw fatal('no tag message?')
      message = (await import('../../git/integrate')).stripComments(edited)
      if (!message.trim()) throw fatal('no tag message?')
    }
    const identity = await repo.identity()
    await git.annotatedTag({
      fs: ctx.fs,
      gitdir: repo.gitdir,
      ref: name,
      object: oid,
      message,
      tagger: { ...identity, timestamp: ctx.clock.now(), timezoneOffset: 0 },
      force: parsed.flags.has('force'),
    })
  } else {
    await git.tag({ fs: ctx.fs, gitdir: repo.gitdir, ref: name, object: oid, force: parsed.flags.has('force') })
  }
}

const merge: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--no-ff': 'noFf',
      '--ff-only': 'ffOnly',
      '--ff': 'ff',
      '--squash': 'squash',
      '--abort': 'abort',
      '--continue': 'continue',
      '--no-edit': 'noEdit',
      '--no-commit': 'noCommit',
      '-q': 'quiet',
      '--allow-unrelated-histories': 'unrelated',
      '--quit': 'quit',
    },
    values: { '-m': 'message', '--message': 'message', '-s': 'strategy', '--strategy': 'strategy', '-X': 'strategyOption' },
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('abort')) {
    ctx.reflogMessage = 'merge --abort'
    await abortMerge(repo)
    ctx.events.push({ type: 'fs-changed' })
    return
  }
  if (parsed.flags.has('continue')) {
    if (!(await repo.getMergeHead())) throw fatal('There is no merge in progress (MERGE_HEAD missing).')
    const result = await concludeMerge(repo, parsed.values['message'])
    ctx.reflogMessage = `commit (merge): ${subjectOf((await repo.readCommit(result.oid)).commit.message)}`
    ctx.out.push(...result.lines)
    return
  }
  if (parsed.values['strategy'] || parsed.values['strategyOption']) throw fatal('merge strategies are fixed to the default three-way merge in Commit Lab.')
  const target = parsed.positional[0]
  if (!target) {
    const branch = await repo.currentBranch()
    const up = branch ? await upstreamOf(repo, branch) : null
    if (!up) throw fatal('No remote for the current branch.')
    const result = await mergeRef(repo, `${up.remote}/${up.branch}`, {})
    ctx.out.push(...result.lines)
    return
  }
  const result = await mergeRef(repo, target, {
    noFf: parsed.flags.has('noFf'),
    ffOnly: parsed.flags.has('ffOnly'),
    message: parsed.values['message'],
    squash: parsed.flags.has('squash'),
  })
  if (result.status === 'fast-forward') ctx.reflogMessage = `merge ${target}: Fast-forward`
  else if (result.status === 'ok') ctx.reflogMessage = `merge ${target}: Merge made by the 'ort' strategy.`
  ctx.out.push(...result.lines)
  ctx.events.push({ type: 'fs-changed' })
  return result.status === 'conflict' ? 1 : 0
}

const rebaseCmd: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '-i': 'interactive',
      '--interactive': 'interactive',
      '--continue': 'continue',
      '--abort': 'abort',
      '--skip': 'skip',
      '--quit': 'quit',
      '--edit-todo': 'editTodo',
      '--autosquash': 'autosquash',
      '--autostash': 'autostash',
      '-q': 'quiet',
    },
    values: { '--onto': 'onto' },
  })
  const repo = await findRepo(ctx)
  const editMessage = async (initial: string) => ctx.io.openEditor({ title: 'COMMIT_EDITMSG', content: initial, help: 'Edit the commit message, then save.' })
  if (parsed.flags.has('abort')) {
    await abortRebase(repo)
    ctx.reflogMessage = 'rebase (abort): updating HEAD'
    ctx.events.push({ type: 'fs-changed' })
    return
  }
  if (parsed.flags.has('continue')) {
    const r = await continueRebase(repo, editMessage)
    ctx.reflogMessage = 'rebase (continue)'
    ctx.out.push(...r.lines)
    ctx.events.push({ type: 'fs-changed' })
    return r.status === 'conflict' ? 1 : 0
  }
  if (parsed.flags.has('skip')) {
    const r = await skipRebase(repo, editMessage)
    ctx.reflogMessage = 'rebase (skip)'
    ctx.out.push(...r.lines)
    ctx.events.push({ type: 'fs-changed' })
    return r.status === 'conflict' ? 1 : 0
  }
  if (parsed.flags.has('editTodo')) throw fatal('editing the todo list mid-rebase is not available here. Finish or abort the rebase, then start again with -i.')
  let upstream = parsed.positional[0]
  if (!upstream) {
    const branch = await repo.currentBranch()
    const up = branch ? await upstreamOf(repo, branch) : null
    if (!up)
      throw fatal(
        `There is no tracking information for the current branch.\nPlease specify which branch you want to rebase against.\nSee git-rebase(1) for details.\n\n    git rebase '<branch>'`,
      )
    upstream = `${up.remote}/${up.branch}`
  }
  if (parsed.positional[1]) {
    // git rebase <upstream> <branch>: switch to branch first
    await switchTo(repo, parsed.positional[1], {})
  }
  const r = await rebase(repo, {
    upstream,
    onto: parsed.values['onto'],
    interactive: parsed.flags.has('interactive'),
    editTodo: async (todo) =>
      ctx.io.openEditor({
        title: 'git-rebase-todo',
        content: todo,
        language: 'git-rebase',
        help: 'Reorder lines or change pick to reword, squash, fixup or drop. Save to run the rebase.',
      }),
    editMessage,
  })
  ctx.reflogMessage =
    r.status === 'ok'
      ? `rebase (finish): returning to ${(await repo.currentBranch()) ? 'refs/heads/' + (await repo.currentBranch()) : 'detached HEAD'}`
      : `rebase (start): checkout ${upstream}`
  ctx.out.push(...r.lines)
  ctx.events.push({ type: 'fs-changed' })
  return r.status === 'conflict' ? 1 : 0
}

const cherryPickCmd: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--continue': 'continue',
      '--abort': 'abort',
      '--skip': 'skip',
      '--quit': 'quit',
      '-n': 'noCommit',
      '--no-commit': 'noCommit',
      '-x': 'record',
      '-e': 'edit',
      '--edit': 'edit',
    },
    values: { '-m': 'mainline', '--mainline': 'mainline' },
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('abort')) {
    await abortPick(repo, 'cherry-pick')
    ctx.events.push({ type: 'fs-changed' })
    return
  }
  if (parsed.flags.has('continue')) {
    const r = await continuePick(repo, 'cherry-pick')
    ctx.reflogMessage = `cherry-pick: ${r.lines[0]}`
    ctx.out.push(...r.lines)
    return
  }
  if (parsed.flags.has('skip') || parsed.flags.has('quit')) {
    await repo.clearOperationState()
    return
  }
  if (parsed.values['mainline']) throw fatal('cherry-picking merge commits with -m is not available here; pick the individual commits instead.')
  const revs = parsed.positional
  if (!revs.length) throw new GitError('usage: git cherry-pick [-n] <commit>...', { prefix: 'none', exitCode: 129 })
  const expanded: string[] = []
  for (const r of revs) {
    const range = /^(.+)\.\.(.+)$/.exec(r)
    if (range) {
      const { revList } = await import('../../git/history')
      const list = await revList(repo, [await repo.resolveRevision(range[2]!)], [await repo.resolveRevision(range[1]!)])
      expanded.push(...list.reverse().map((c) => c.oid))
    } else expanded.push(r)
  }
  const result = await cherryPick(repo, expanded, { noCommit: parsed.flags.has('noCommit') })
  if (result.commitOid) ctx.reflogMessage = `cherry-pick: ${subjectOf((await repo.readCommit(result.commitOid)).commit.message)}`
  ctx.out.push(...result.lines)
  ctx.events.push({ type: 'fs-changed' })
  return result.status === 'conflict' ? 1 : 0
}

const revert: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--continue': 'continue',
      '--abort': 'abort',
      '--skip': 'skip',
      '--quit': 'quit',
      '-n': 'noCommit',
      '--no-commit': 'noCommit',
      '--no-edit': 'noEdit',
      '-e': 'edit',
      '--edit': 'edit',
    },
    values: { '-m': 'mainline', '--mainline': 'mainline' },
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('abort')) {
    await abortPick(repo, 'revert')
    ctx.events.push({ type: 'fs-changed' })
    return
  }
  if (parsed.flags.has('continue')) {
    const r = await continuePick(repo, 'revert')
    ctx.reflogMessage = `revert: ${r.lines[0]}`
    ctx.out.push(...r.lines)
    return
  }
  if (parsed.values['mainline']) throw fatal('reverting merge commits with -m is not available here.')
  const revs = parsed.positional
  if (!revs.length) throw new GitError('usage: git revert [-n] [--no-edit] <commit>...', { prefix: 'none', exitCode: 129 })
  const result = await revertCommits(repo, revs, { noCommit: parsed.flags.has('noCommit'), noEdit: true })
  if (result.commitOid) ctx.reflogMessage = `revert: ${subjectOf((await repo.readCommit(result.commitOid)).commit.message)}`
  ctx.out.push(...result.lines)
  ctx.events.push({ type: 'fs-changed' })
  return result.status === 'conflict' ? 1 : 0
}

const reset: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--soft': 'soft',
      '--mixed': 'mixed',
      '--hard': 'hard',
      '--merge': 'merge',
      '--keep': 'keep',
      '-q': 'quiet',
      '--quiet': 'quiet',
      '-p': 'patch',
      '--patch': 'patch',
    },
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('patch')) throw fatal('`git reset -p` is not available here; use `git restore --staged <file>`.')
  if (parsed.flags.has('merge') || parsed.flags.has('keep')) throw fatal('only --soft, --mixed and --hard are available in Commit Lab.')
  const mode: ResetMode = parsed.flags.has('hard') ? 'hard' : parsed.flags.has('soft') ? 'soft' : 'mixed'
  const head = await repo.headOid()
  if (!head) throw fatal('Failed to resolve HEAD as a valid ref.')

  // Path form
  let rev = 'HEAD'
  let paths: string[] = parsed.afterDashDash
  if (!paths.length && parsed.positional.length) {
    const first = parsed.positional[0]!
    if (await isRevision(repo, first)) {
      rev = first
      paths = parsed.positional.slice(1)
    } else {
      paths = parsed.positional
    }
  } else if (parsed.positional[0]) rev = parsed.positional[0]

  if (paths.length) {
    if (mode !== 'mixed') throw fatal(`Cannot do ${mode} reset with paths.`)
    const repoPaths: string[] = []
    for (const p of paths) {
      const expanded = await expandPathspec(ctx, repo, p)
      if (!expanded.length) throw fatal(`ambiguous argument '${p}': unknown revision or path not in the working tree.`)
      repoPaths.push(...expanded)
    }
    await resetPaths(repo, rev, repoPaths)
    const st = await computeStatus(repo)
    const touched = st.unstaged.filter((e) => repoPaths.includes(e.path))
    if (touched.length) {
      ctx.out.push('Unstaged changes after reset:')
      for (const e of touched) ctx.out.push(`${e.unstaged === 'deleted' ? 'D' : 'M'}\t${e.path}`)
    }
    return
  }
  const lines = await resetTo(repo, mode, rev)
  ctx.reflogMessage = `reset: moving to ${rev}`
  if (!parsed.flags.has('quiet')) ctx.out.push(...lines)
  ctx.events.push({ type: 'fs-changed' })
}

const stash: GitSubcommand = async (ctx, args) => {
  const repo = await findRepo(ctx)
  let [sub, ...rest] = args
  if (!sub || sub.startsWith('-')) {
    rest = args
    sub = 'push'
  }
  switch (sub) {
    case 'push':
    case 'save': {
      const parsed = parseArgs(rest, {
        flags: {
          '-u': 'untracked',
          '--include-untracked': 'untracked',
          '-k': 'keepIndex',
          '--keep-index': 'keepIndex',
          '-p': 'patch',
          '-a': 'all',
          '--all': 'all',
          '-q': 'quiet',
        },
        values: { '-m': 'message', '--message': 'message' },
      })
      if (parsed.flags.has('patch')) throw fatal('`git stash -p` is not available here.')
      if (parsed.flags.has('keepIndex')) throw fatal('`git stash --keep-index` is not available here.')
      if (parsed.afterDashDash.length || (sub === 'push' && parsed.positional.length))
        throw fatal('stashing specific paths is not available here; stash everything or commit selectively with `git add -p`.')
      const message = sub === 'save' ? parsed.positional.join(' ') || undefined : parsed.values['message']
      const lines = await stashPush(repo, message, { includeUntracked: parsed.flags.has('untracked') || parsed.flags.has('all') })
      ctx.reflogMessage = 'reset: moving to HEAD'
      ctx.out.push(...lines)
      ctx.events.push({ type: 'fs-changed' })
      return
    }
    case 'list': {
      const list = await stashList(repo)
      for (const e of list) ctx.out.push(`${ansi.yellow(`stash@{${e.index}}`)}: ${e.message}`)
      return
    }
    case 'show': {
      const parsed = parseArgs(rest, { flags: { '-p': 'patch', '--patch': 'patch', '--stat': 'stat', '-u': 'untracked', '--include-untracked': 'untracked' } })
      const info = await stashShow(repo, parsed.positional[0])
      const diffs = await diffFlatTreeContents(repo, await readFlatTree(repo, info.base), await readFlatTree(repo, info.oid))
      if (parsed.flags.has('patch')) ctx.out.push(...formatUnified(diffs, true))
      else ctx.out.push(...formatStat(diffs))
      return
    }
    case 'pop':
    case 'apply': {
      const parsed = parseArgs(rest, { flags: { '--index': 'index', '-q': 'quiet' } })
      const lines = await stashApply(repo, parsed.positional[0], { pop: sub === 'pop', index: parsed.flags.has('index') })
      ctx.out.push(...lines)
      ctx.events.push({ type: 'fs-changed' })
      const conflicts = await repo.getConflicts()
      return conflicts.length ? 1 : 0
    }
    case 'drop': {
      ctx.out.push(
        ...(await stashDrop(
          repo,
          rest.find((a) => !a.startsWith('-')),
        )),
      )
      return
    }
    case 'clear':
      await stashClear(repo)
      return
    case 'branch': {
      const [name, ref] = rest
      if (!name) throw fatal('usage: git stash branch <branchname> [<stash>]')
      const info = await stashShow(repo, ref)
      await switchTo(repo, name, { create: name, startPoint: info.base })
      const lines = await stashApply(repo, ref, { pop: true })
      ctx.reflogMessage = `checkout: moving to ${name}`
      ctx.out.push(`Switched to a new branch '${name}'`, ...lines)
      ctx.events.push({ type: 'fs-changed' })
      return
    }
    default:
      throw new GitError(
        `usage: git stash list\n   or: git stash show [-p] [<stash>]\n   or: git stash drop [<stash>]\n   or: git stash pop [--index] [<stash>]\n   or: git stash apply [--index] [<stash>]\n   or: git stash branch <branchname> [<stash>]\n   or: git stash clear\n   or: git stash [push [-u] [-m <message>]]`,
        { prefix: 'none', exitCode: 129 },
      )
  }
}

export const branches: Record<string, GitSubcommand> = {
  branch,
  switch: switchCmd,
  checkout,
  tag,
  merge,
  rebase: rebaseCmd,
  'cherry-pick': cherryPickCmd,
  revert,
  reset,
  stash,
}

export type { CommandContext }

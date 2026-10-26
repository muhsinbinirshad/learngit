import git from 'isomorphic-git'
import { exists, isDir, listFilesRecursive, readTextOrNull, relative, writeFileDeep, rmrf, mkdirp } from '../../fs'
import { fatal, gitErr, GitError } from '../../git/errors'
import { Repo, shortOid, subjectOf } from '../../git/repo'
import { readGlobalConfig, setGlobalConfig } from '../../git/identity'
import { computeStatus, isIgnored, stagePath, removeFromIndex, type RepoStatus } from '../../git/worktree'
import { readIndex } from '../../git/tree'
import { createCommit, formatCommitSummaryLine } from '../../git/commit'
import { restorePaths } from '../../git/checkout'
import { concludeMerge, continuePick, continueRebase, stripComments } from '../../git/integrate'
import { aheadBehind } from '../../git/remote'
import { cloneRepo } from '../../git/remote'
import { parseArgs } from '../args'
import { ansi } from '../format'
import type { CommandContext } from '../types'
import { findRepo, repoPath, displayPath } from './context'
import type { GitSubcommand } from './index'
import { startAddPatch } from './addPatch'

const init: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, { values: { '--initial-branch': 'branch', '-b': 'branch' }, flags: { '--bare': 'bare', '-q': 'quiet', '--quiet': 'quiet' } })
  const target = parsed.positional[0] ? ctx.resolve(parsed.positional[0]) : ctx.cwd
  if (parsed.flags.has('bare')) throw fatal('bare repositories are created by the lab for you; `git init --bare` is not needed here.')
  await mkdirp(ctx.fs, target)
  const repo = new Repo(ctx.fs, target, ctx.clock)
  if (await repo.exists()) {
    ctx.out.push(`Reinitialized existing Git repository in ${target}/.git/`)
    return
  }
  await repo.init(parsed.values['branch'] ?? 'main')
  if (!parsed.flags.has('quiet')) ctx.out.push(`Initialized empty Git repository in ${target}/.git/`)
}

const clone: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, { flags: { '-q': 'quiet', '--quiet': 'quiet' }, values: { '-b': 'branch', '--branch': 'branch' } })
  const url = parsed.positional[0]
  if (!url) throw fatal('You must specify a repository to clone.')
  const source = url.startsWith('/') ? url : url.startsWith('~') ? ctx.resolve(url) : ctx.resolve(url)
  if (/^(https?:|git@|ssh:)/.test(url)) {
    throw new GitError(
      `Commit Lab runs fully in your browser, so it cannot reach '${url}'.\nRemotes in labs are local paths such as /remotes/team.git. Run 'git remote -v' in a seeded repo to see one.`,
      { prefix: 'none' },
    )
  }
  const name = parsed.positional[1] ?? (url.replace(/\/$/, '').split('/').pop() ?? 'repo').replace(/\.git$/, '')
  const dir = ctx.resolve(name)
  const { lines } = await cloneRepo(ctx.fs, source, dir, ctx.clock)
  if (!parsed.flags.has('quiet')) ctx.out.push(...lines)
  ctx.events.push({ type: 'fs-changed' })
}

const config: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: { '--global': 'global', '--local': 'local', '--list': 'list', '-l': 'list', '--unset': 'unset', '--get': 'get', '--system': 'system' },
  })
  if (parsed.flags.has('system')) throw fatal('--system configuration is not used in this environment; use --global.')
  const isGlobal = parsed.flags.has('global')
  const repo: Repo | null = await findRepo(ctx).catch(() => null)
  if (parsed.flags.has('list')) {
    const globalCfg = await readGlobalConfig(ctx.fs)
    for (const [k, v] of Object.entries(globalCfg)) ctx.out.push(`${k}=${v}`)
    if (repo && !isGlobal) {
      const text = (await readTextOrNull(ctx.fs, `${repo.gitdir}/config`)) ?? ''
      const { parseIni } = await import('../../git/identity')
      for (const [k, v] of Object.entries(parseIni(text))) ctx.out.push(`${k}=${v}`)
    }
    return
  }
  const [key, value] = parsed.positional
  if (!key)
    throw new GitError('usage: git config [--global] <key> [<value>]\n       git config [--global] --unset <key>\n       git config --list', {
      prefix: 'none',
      exitCode: 129,
    })
  if (!/^[a-zA-Z][\w-]*(\.[\w.-]+)+$/.test(key)) throw gitErr(`key does not contain a section: ${key}`)
  if (parsed.flags.has('unset')) {
    if (isGlobal) await setGlobalConfig(ctx.fs, key, null)
    else {
      if (!repo) throw fatal('not in a git directory')
      await repo.setConfig(key, null)
    }
    return
  }
  if (value === undefined) {
    let v: string | undefined
    if (isGlobal) v = (await readGlobalConfig(ctx.fs))[key]
    else v = repo ? await repo.config(key) : (await readGlobalConfig(ctx.fs))[key]
    if (v === undefined) return 1
    ctx.out.push(v)
    return
  }
  if (isGlobal) await setGlobalConfig(ctx.fs, key, value)
  else {
    if (!repo) throw fatal('not in a git directory')
    await repo.setConfig(key, value)
  }
}

export async function formatStatusLong(ctx: CommandContext, repo: Repo, status: RepoStatus): Promise<string[]> {
  const lines: string[] = []
  const state = await repo.state()
  if (state.rebase) {
    const total = state.rebase.done.length + state.rebase.todo.length + (state.rebase.current ? 1 : 0)
    const step = state.rebase.done.length + (state.rebase.current ? 1 : 0)
    lines.push(`interactive rebase in progress; onto ${shortOid(state.rebase.onto)}`)
    lines.push(`Last command done (${step} command${step === 1 ? '' : 's'} done):`)
    if (state.rebase.current) lines.push(`   ${state.rebase.current.action} ${shortOid(state.rebase.current.oid)}`)
    if (state.rebase.todo.length)
      lines.push(
        `Next command${state.rebase.todo.length === 1 ? '' : 's'} to do (${state.rebase.todo.length} remaining command${state.rebase.todo.length === 1 ? '' : 's'}):`,
        ...state.rebase.todo.slice(0, 3).map((t) => `   ${t.action} ${shortOid(t.oid)}`),
      )
    lines.push(`  (use "git rebase --edit-todo" to view and edit)`)
    lines.push(
      `You are currently rebasing${state.rebase.headName ? ` branch '${state.rebase.headName.replace('refs/heads/', '')}' on '${shortOid(state.rebase.onto)}'` : ''}.`,
    )
    if (state.conflicts.length)
      lines.push(
        '  (fix conflicts and then run "git rebase --continue")',
        '  (use "git rebase --skip" to skip this patch)',
        '  (use "git rebase --abort" to check out the original branch)',
      )
    else lines.push('  (all conflicts fixed: run "git rebase --continue")')
    lines.push('')
    void total
  } else if (status.branch) {
    lines.push(`On branch ${status.branch}`)
    const ab = await aheadBehind(repo, status.branch)
    if (ab) {
      if (ab.ahead && ab.behind)
        lines.push(
          `Your branch and '${ab.upstream}' have diverged,`,
          `and have ${ab.ahead} and ${ab.behind} different commits each, respectively.`,
          `  (use "git pull" if you want to integrate the remote branch with yours)`,
        )
      else if (ab.ahead)
        lines.push(
          `Your branch is ahead of '${ab.upstream}' by ${ab.ahead} commit${ab.ahead === 1 ? '' : 's'}.`,
          `  (use "git push" to publish your local commits)`,
        )
      else if (ab.behind)
        lines.push(
          `Your branch is behind '${ab.upstream}' by ${ab.behind} commit${ab.behind === 1 ? '' : 's'}, and can be fast-forwarded.`,
          `  (use "git pull" to update your local branch)`,
        )
      else lines.push(`Your branch is up to date with '${ab.upstream}'.`)
    }
    lines.push('')
  } else {
    lines.push(`HEAD detached at ${shortOid(status.headOid ?? '')}`, '')
  }
  if (!status.headOid && !state.rebase) {
    lines.splice(1, 0, '', 'No commits yet')
  }
  if (state.bisect)
    lines.push(
      `You are currently bisecting, started from branch '${state.bisect.startRef}'.`,
      `  (use "git bisect reset" to get back to the original branch)`,
      '',
    )
  if (state.mergeHead) {
    if (state.conflicts.length)
      lines.push('You have unmerged paths.', '  (fix conflicts and run "git commit")', '  (use "git merge --abort" to abort the merge)', '')
    else lines.push('All conflicts fixed but you are still merging.', '  (use "git commit" to conclude merge)', '')
  }
  if (state.cherryPickHead) {
    lines.push(`You are currently cherry-picking commit ${shortOid(state.cherryPickHead)}.`)
    lines.push(
      state.conflicts.length ? '  (fix conflicts and run "git cherry-pick --continue")' : '  (all conflicts fixed: run "git cherry-pick --continue")',
      '  (use "git cherry-pick --abort" to cancel the cherry-pick operation)',
      '',
    )
  }
  if (state.revertHead) {
    lines.push(`You are currently reverting commit ${shortOid(state.revertHead)}.`)
    lines.push(
      state.conflicts.length ? '  (fix conflicts and run "git revert --continue")' : '  (all conflicts fixed: run "git revert --continue")',
      '  (use "git revert --abort" to cancel the revert operation)',
      '',
    )
  }
  const d = (p: string) => displayPath(ctx, repo, p)
  if (status.staged.length) {
    lines.push('Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)')
    for (const e of status.staged) lines.push(ansi.green(`\t${(e.staged === 'added' ? 'new file' : e.staged!) + ':'}`.padEnd(13) + d(e.path)))
    lines.push('')
  }
  if (status.conflicted.length) {
    lines.push('Unmerged paths:', '  (use "git add <file>..." to mark resolution)')
    for (const e of status.conflicted) lines.push(ansi.red(`\tboth modified:   ${d(e.path)}`))
    lines.push('')
  }
  if (status.unstaged.length) {
    lines.push(
      'Changes not staged for commit:',
      '  (use "git add <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)',
    )
    for (const e of status.unstaged) lines.push(ansi.red(`\t${e.unstaged + ':'}`.padEnd(13) + d(e.path)))
    lines.push('')
  }
  if (status.untracked.length) {
    lines.push('Untracked files:', '  (use "git add <file>..." to include in what will be committed)')
    for (const p of status.untrackedCollapsed) lines.push(ansi.red(`\t${d(p)}`))
    lines.push('')
  }
  if (status.clean) {
    if (!status.headOid) lines.push('nothing to commit (create/copy files and use "git add" to track)')
    else lines.push('nothing to commit, working tree clean')
  } else if (!status.staged.length && !status.conflicted.length) {
    if (status.unstaged.length) lines.push('no changes added to commit (use "git add" and/or "git commit -a")')
    else lines.push('nothing added to commit but untracked files present (use "git add" to track)')
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function formatStatusShort(ctx: CommandContext, repo: Repo, status: RepoStatus, withBranch: boolean): string[] {
  const lines: string[] = []
  if (withBranch) lines.push(`## ${status.branch ?? 'HEAD (no branch)'}`)
  for (const e of status.entries) {
    const p = displayPath(ctx, repo, e.path)
    if (e.conflicted) {
      lines.push(`${ansi.red('UU')} ${p}`)
      continue
    }
    if (e.untracked) continue
    const x = e.staged === 'added' ? 'A' : e.staged === 'modified' ? 'M' : e.staged === 'deleted' ? 'D' : ' '
    const y = e.unstaged === 'modified' ? 'M' : e.unstaged === 'deleted' ? 'D' : ' '
    lines.push(`${x === ' ' ? ' ' : ansi.green(x)}${y === ' ' ? ' ' : ansi.red(y)} ${p}`)
  }
  for (const p of status.untrackedCollapsed) lines.push(`${ansi.red('??')} ${displayPath(ctx, repo, p)}`)
  return lines
}

const status: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '-s': 'short',
      '--short': 'short',
      '-b': 'branch',
      '--branch': 'branch',
      '--porcelain': 'short',
      '-u': 'untracked',
      '--untracked-files': 'untracked',
    },
  })
  const repo = await findRepo(ctx)
  const st = await computeStatus(repo)
  if (parsed.flags.has('short')) ctx.out.push(...formatStatusShort(ctx, repo, st, parsed.flags.has('branch')))
  else ctx.out.push(...(await formatStatusLong(ctx, repo, st)))
}

/** Expand a pathspec (file, directory or '.') into repo-relative file paths present in worktree or index. */
export async function expandPathspec(ctx: CommandContext, repo: Repo, spec: string, includeDeleted = true): Promise<string[]> {
  const rel = repoPath(ctx, repo, spec)
  const abs = rel === '.' ? repo.dir : `${repo.dir}/${rel}`
  const results = new Set<string>()
  if (await isDir(ctx.fs, abs)) {
    for (const f of await listFilesRecursive(ctx.fs, abs, true)) results.add(relative(repo.dir, f))
    if (includeDeleted) {
      const index = await readIndex(repo)
      for (const p of index.keys()) if (rel === '.' || p === rel || p.startsWith(rel + '/')) results.add(p)
    }
  } else if (await exists(ctx.fs, abs)) {
    results.add(rel)
  } else if (includeDeleted && (await readIndex(repo)).has(rel)) {
    results.add(rel)
  }
  return [...results].sort()
}

const add: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '-A': 'all',
      '--all': 'all',
      '-f': 'force',
      '--force': 'force',
      '-p': 'patch',
      '--patch': 'patch',
      '-u': 'update',
      '--update': 'update',
      '-v': 'verbose',
      '--verbose': 'verbose',
      '-n': 'dryRun',
      '--dry-run': 'dryRun',
      '-i': 'interactive',
      '--interactive': 'interactive',
    },
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('interactive')) throw fatal('`git add -i` is not available here. Use `git add -p <file>` to stage hunks interactively.')
  let specs = [...parsed.positional, ...parsed.afterDashDash]
  if (parsed.flags.has('patch')) {
    return startAddPatch(ctx, repo, specs)
  }
  if (parsed.flags.has('all') || parsed.flags.has('update')) specs = specs.length ? specs : ['.']
  if (!specs.length) {
    ctx.out.push('Nothing specified, nothing added.', `hint: Maybe you wanted to say 'git add .'?`)
    return 0
  }
  const status = await computeStatus(repo)
  const ignoredRequested: string[] = []
  for (const spec of specs) {
    const paths = await expandPathspec(ctx, repo, spec)
    if (!paths.length) {
      const rel = repoPath(ctx, repo, spec)
      if (await isIgnored(repo, rel)) {
        ignoredRequested.push(spec)
        continue
      }
      throw fatal(`pathspec '${spec}' did not match any files`)
    }
    const explicitFile = !(await isDir(ctx.fs, spec === '.' ? repo.dir : ctx.resolve(spec)))
    for (const p of paths) {
      const entry = status.entries.find((e) => e.path === p)
      const inWorktree = await exists(ctx.fs, `${repo.dir}/${p}`)
      if (!inWorktree) {
        if (parsed.flags.has('dryRun')) ctx.out.push(`remove '${p}'`)
        else {
          await removeFromIndex(repo, p)
          await repo.clearConflict(p)
        }
        continue
      }
      if (parsed.flags.has('update') && (!entry || entry.untracked)) continue
      if (!parsed.flags.has('force') && (await isIgnored(repo, p))) {
        if (explicitFile) ignoredRequested.push(p)
        continue
      }
      if (parsed.flags.has('dryRun')) {
        ctx.out.push(`add '${p}'`)
        continue
      }
      await stagePath(repo, p, parsed.flags.has('force'))
      await repo.clearConflict(p)
      if (parsed.flags.has('verbose')) ctx.out.push(`add '${p}'`)
    }
  }
  if (ignoredRequested.length) {
    ctx.out.push(
      'The following paths are ignored by one of your .gitignore files:',
      ...ignoredRequested,
      'hint: Use -f if you really want to add them.',
      'hint: Turn this message off by running',
      'hint: "git config advice.addIgnoredFile false"',
    )
    return 1
  }
  ctx.events.push({ type: 'fs-changed' })
}

const rm: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, { flags: { '--cached': 'cached', '-r': 'recursive', '-f': 'force', '--force': 'force', '-q': 'quiet', '--quiet': 'quiet' } })
  const repo = await findRepo(ctx)
  const specs = [...parsed.positional, ...parsed.afterDashDash]
  if (!specs.length) throw fatal('No pathspec was given. Which files should I remove?')
  const index = await readIndex(repo)
  const status = await computeStatus(repo)
  for (const spec of specs) {
    const rel = repoPath(ctx, repo, spec)
    const abs = `${repo.dir}/${rel}`
    const isDirectory = await isDir(ctx.fs, abs)
    if (isDirectory && !parsed.flags.has('recursive')) throw fatal(`not removing '${spec}' recursively without -r`)
    const paths = [...index.keys()].filter((p) => p === rel || p.startsWith(rel + '/'))
    if (!paths.length) throw fatal(`pathspec '${spec}' did not match any files`)
    for (const p of paths) {
      const e = status.entries.find((s) => s.path === p)
      if (!parsed.flags.has('force') && !parsed.flags.has('cached') && e && (e.unstaged || e.staged)) {
        throw gitErr(`the following file has local modifications:\n    ${p}\n(use --cached to keep the file, or -f to force removal)`)
      }
      await removeFromIndex(repo, p)
      await repo.clearConflict(p)
      if (!parsed.flags.has('cached')) await rmrf(ctx.fs, abs === repo.dir ? `${repo.dir}/${p}` : `${repo.dir}/${p}`)
      if (!parsed.flags.has('quiet')) ctx.out.push(`rm '${p}'`)
    }
  }
  ctx.events.push({ type: 'fs-changed' })
}

const mv: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, { flags: { '-f': 'force', '-k': 'skip', '-v': 'verbose' } })
  const repo = await findRepo(ctx)
  const [src, dst] = parsed.positional
  if (!src || !dst) throw fatal('usage: git mv <source> <destination>')
  const from = repoPath(ctx, repo, src)
  let to = repoPath(ctx, repo, dst)
  const index = await readIndex(repo)
  if (!index.has(from)) throw fatal(`not under version control, source=${from}, destination=${to}`)
  if (await isDir(ctx.fs, `${repo.dir}/${to}`)) to = `${to}/${from.split('/').pop()}`
  if ((await exists(ctx.fs, `${repo.dir}/${to}`)) && !parsed.flags.has('force')) throw fatal(`destination exists, source=${from}, destination=${to}`)
  const data = await ctx.fs.promises.readFile(`${repo.dir}/${from}`)
  await writeFileDeep(ctx.fs, `${repo.dir}/${to}`, data as Uint8Array)
  await rmrf(ctx.fs, `${repo.dir}/${from}`)
  await removeFromIndex(repo, from)
  await stagePath(repo, to, true)
  if (parsed.flags.has('verbose')) ctx.out.push(`Renaming ${from} to ${to}`)
  ctx.events.push({ type: 'fs-changed' })
}

const restore: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: { '--staged': 'staged', '-S': 'staged', '--worktree': 'worktree', '-W': 'worktree' },
    values: { '--source': 'source', '-s': 'source' },
  })
  const repo = await findRepo(ctx)
  const specs = [...parsed.positional, ...parsed.afterDashDash]
  if (!specs.length) throw fatal('you must specify path(s) to restore')
  const paths: string[] = []
  for (const s of specs) {
    const expanded = await expandPathspec(ctx, repo, s)
    if (!expanded.length) throw gitErr(`pathspec '${s}' did not match any file(s) known to git`)
    paths.push(...expanded)
  }
  await restorePaths(repo, paths, {
    staged: parsed.flags.has('staged'),
    worktree: parsed.flags.has('worktree') ? true : undefined,
    source: parsed.values['source'],
  })
  ctx.events.push({ type: 'fs-changed' })
}

const commit: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '-a': 'all',
      '--all': 'all',
      '--amend': 'amend',
      '--no-edit': 'noEdit',
      '--allow-empty': 'allowEmpty',
      '-q': 'quiet',
      '--quiet': 'quiet',
      '-v': 'verbose',
      '-s': 'signoff',
      '--signoff': 'signoff',
      '-S': 'gpgsign',
      '--no-verify': 'noVerify',
      '-n': 'noVerify',
    },
    values: {
      '-m': 'message',
      '--message': 'message',
      '-F': 'file',
      '--file': 'file',
      '--author': 'author',
      '--date': 'date',
      '-C': 'reuse',
      '-c': 'reuseEdit',
    },
    multi: ['message'],
  })
  const repo = await findRepo(ctx)
  if (parsed.flags.has('gpgsign'))
    ctx.out.push(ansi.gray('Note: commit signing is simulated in Commit Lab; the commit is recorded as signed by your identity.'))
  await repo.identity() // fail early with the standard identity message

  if (parsed.flags.has('all')) {
    const st = await computeStatus(repo)
    for (const e of st.entries) {
      if (e.untracked) continue
      if (e.unstaged === 'deleted') await removeFromIndex(repo, e.path)
      else if (e.unstaged === 'modified') await stagePath(repo, e.path, true)
    }
  }
  const pathspecs = [...parsed.positional, ...parsed.afterDashDash]
  if (pathspecs.length) {
    for (const s of pathspecs) for (const p of await expandPathspec(ctx, repo, s)) await stagePath(repo, p, true)
  }

  const state = await repo.state()
  let message = parsed.multi['message']?.join('\n\n')
  if (parsed.values['file']) message = (await readTextOrNull(ctx.fs, ctx.resolve(parsed.values['file']))) ?? undefined
  if (parsed.values['reuse']) {
    const oid = await repo.resolveRevision(parsed.values['reuse'])
    message = (await repo.readCommit(oid)).commit.message
  }

  // Merge conclusion
  if (state.mergeHead) {
    const stDirty = await computeStatus(repo)
    if (!message && !parsed.flags.has('noEdit')) {
      const template = `${(await repo.getMergeMsg()) ?? 'Merge'}\n# Please enter a commit message to explain why this merge is necessary,\n# especially if it merges an updated upstream into a topic branch.\n#\n# Lines starting with '#' will be ignored, and an empty message aborts\n# the commit.\n`
      const edited = await ctx.io.openEditor({ title: 'MERGE_MSG', content: template, help: 'Write the merge commit message, then save to continue.' })
      if (edited === null) throw fatal('Aborting commit due to empty commit message.')
      message = stripComments(edited)
    }
    void stDirty
    const result = await concludeMerge(repo, message)
    ctx.reflogMessage = `commit (merge): ${subjectOf(result.lines[0]!.replace(/^\[[^\]]+\] /, ''))}`
    ctx.out.push(...result.lines)
    return
  }
  if (state.cherryPickHead || state.revertHead) {
    const kind = state.cherryPickHead ? 'cherry-pick' : 'revert'
    const r = await continuePick(repo, kind)
    ctx.reflogMessage = `commit (${kind}): ${r.lines[0]}`
    ctx.out.push(...r.lines)
    return
  }
  if (state.rebase && state.rebase.current) {
    const r = await continueRebase(repo, async (initial) =>
      ctx.io.openEditor({ title: 'COMMIT_EDITMSG', content: initial, help: 'Edit the commit message, then save.' }),
    )
    ctx.reflogMessage = 'rebase (continue)'
    ctx.out.push(...r.lines)
    return
  }

  let amendMessage: string | undefined
  if (parsed.flags.has('amend')) {
    const head = await repo.headOid()
    if (!head) throw fatal('You have nothing to amend.')
    amendMessage = (await repo.readCommit(head)).commit.message
    if (!message && parsed.flags.has('noEdit')) message = amendMessage
  }

  if (!message) {
    const st = await computeStatus(repo)
    if (!parsed.flags.has('amend') && !parsed.flags.has('allowEmpty') && !st.staged.length) {
      // Nothing staged: git prints status and exits 1 without opening the editor.
      ctx.out.push(...(await formatStatusLong(ctx, repo, st)))
      return 1
    }
    const template = [
      amendMessage?.trimEnd() ?? '',
      '# Please enter the commit message for your changes. Lines starting',
      "# with '#' will be ignored, and an empty message aborts the commit.",
      '#',
      `# On branch ${st.branch ?? 'HEAD (detached)'}`,
      ...(st.staged.length ? ['# Changes to be committed:', ...st.staged.map((e) => `#\t${e.staged === 'added' ? 'new file' : e.staged}:   ${e.path}`)] : []),
      '#',
    ].join('\n')
    const edited = await ctx.io.openEditor({
      title: 'COMMIT_EDITMSG',
      content: template,
      help: 'Write a commit message. The first line is the subject; keep it under 50 characters. Save to commit.',
    })
    if (edited === null) {
      ctx.out.push('Aborting commit due to empty commit message.')
      return 1
    }
    message = stripComments(edited)
    if (!message.trim()) {
      ctx.out.push('Aborting commit due to empty commit message.')
      return 1
    }
  }
  let author: { name: string; email: string } | undefined
  if (parsed.values['author']) {
    const m = /^(.*?)\s*<(.+)>$/.exec(parsed.values['author'])
    if (!m) throw fatal(`--author '${parsed.values['author']}' is not 'Name <email>' and matches no existing author`)
    author = { name: m[1]!, email: m[2]! }
  }
  const result = await createCommit(repo, { message, amend: parsed.flags.has('amend'), allowEmpty: parsed.flags.has('allowEmpty'), author })
  const subject = subjectOf(message)
  ctx.reflogMessage = `commit${result.isInitial ? ' (initial)' : parsed.flags.has('amend') ? ' (amend)' : ''}: ${subject}`
  if (!parsed.flags.has('quiet')) ctx.out.push(...formatCommitSummaryLine(result, subject))
  ctx.events.push({ type: 'fs-changed' })
}

export const basics: Record<string, GitSubcommand> = { init, clone, config, status, add, rm, mv, restore, commit }

export { git }

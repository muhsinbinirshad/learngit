import git from 'isomorphic-git'
import { exists } from '../../fs'
import { fatal, gitErr, GitError } from '../../git/errors'
import { shortOid } from '../../git/repo'
import { fetchRemote, pushBranch, pushTag, RemoteRepo, resolveRemote, upstreamOf } from '../../git/remote'
import { mergeRef, rebase } from '../../git/integrate'
import { parseArgs } from '../args'
import type { CommandContext } from '../types'
import { findRepo } from './context'
import type { GitSubcommand } from './index'

function rejectNetwork(url: string): void {
  if (/^(https?:|git@|ssh:|git:)/.test(url)) {
    throw new GitError(
      `Commit Lab runs entirely in your browser and cannot reach '${url}'.\nIn labs, remotes are local paths such as /remotes/team.git (see 'git remote -v').`,
      { prefix: 'none' },
    )
  }
}

const remote: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, { flags: { '-v': 'verbose', '--verbose': 'verbose' } })
  const repo = await findRepo(ctx)
  const [sub, ...rest] = parsed.positional
  if (!sub) {
    for (const r of await repo.listRemotes()) {
      if (parsed.flags.has('verbose')) ctx.out.push(`${r.remote}\t${r.url} (fetch)`, `${r.remote}\t${r.url} (push)`)
      else ctx.out.push(r.remote)
    }
    return
  }
  switch (sub) {
    case 'add': {
      const [name, url] = rest
      if (!name || !url) throw new GitError('usage: git remote add <name> <path>', { prefix: 'none', exitCode: 129 })
      rejectNetwork(url)
      if ((await repo.listRemotes()).some((r) => r.remote === name)) throw gitErr(`remote ${name} already exists.`)
      const abs = url.startsWith('/') ? url : ctx.resolve(url)
      const target = new RemoteRepo(ctx.fs, abs)
      if (!(await target.exists()) && !(await exists(ctx.fs, abs))) throw fatal(`'${url}' does not appear to be a git repository`)
      await git.addRemote({ fs: ctx.fs, gitdir: repo.gitdir, remote: name, url: abs })
      return
    }
    case 'remove':
    case 'rm': {
      const name = rest[0]
      if (!name) throw new GitError('usage: git remote remove <name>', { prefix: 'none', exitCode: 129 })
      if (!(await repo.listRemotes()).some((r) => r.remote === name)) throw gitErr(`No such remote: '${name}'`)
      await git.deleteRemote({ fs: ctx.fs, gitdir: repo.gitdir, remote: name })
      for (const b of await repo.listRemoteBranches(name)) await repo.deleteRef(`refs/remotes/${name}/${b}`).catch(() => undefined)
      return
    }
    case 'rename': {
      const [from, to] = rest
      if (!from || !to) throw new GitError('usage: git remote rename <old> <new>', { prefix: 'none', exitCode: 129 })
      const entry = (await repo.listRemotes()).find((r) => r.remote === from)
      if (!entry) throw gitErr(`No such remote: '${from}'`)
      await git.deleteRemote({ fs: ctx.fs, gitdir: repo.gitdir, remote: from })
      await git.addRemote({ fs: ctx.fs, gitdir: repo.gitdir, remote: to, url: entry.url })
      for (const b of await repo.listRemoteBranches(from)) {
        const oid = (await repo.refOid(`refs/remotes/${from}/${b}`))!
        await repo.writeRef(`refs/remotes/${to}/${b}`, oid)
        await repo.deleteRef(`refs/remotes/${from}/${b}`)
      }
      for (const b of await repo.listBranches()) {
        if ((await repo.config(`branch.${b}.remote`)) === from) await repo.setConfig(`branch.${b}.remote`, to)
      }
      return
    }
    case 'show': {
      const name = rest[0]
      if (!name) {
        for (const r of await repo.listRemotes()) ctx.out.push(r.remote)
        return
      }
      const { remote: r, url } = await resolveRemote(repo, name)
      ctx.out.push(`* remote ${name}`, `  Fetch URL: ${url}`, `  Push  URL: ${url}`, `  HEAD branch: ${await r.defaultBranch()}`)
      const branches = await r.listBranches()
      if (branches.length) {
        ctx.out.push('  Remote branches:')
        for (const b of branches)
          ctx.out.push(
            `    ${b.padEnd(20)} ${(await repo.refOid(`refs/remotes/${name}/${b}`)) ? 'tracked' : 'new (next fetch will store in remotes/' + name + ')'}`,
          )
      }
      const tracking: string[] = []
      for (const b of await repo.listBranches()) {
        const up = await upstreamOf(repo, b)
        if (up && up.remote === name) tracking.push(`    ${b} merges with remote ${up.branch}`)
      }
      if (tracking.length) ctx.out.push(`  Local branches configured for 'git pull':`, ...tracking)
      return
    }
    case 'set-url': {
      const [name, url] = rest
      if (!name || !url) throw new GitError('usage: git remote set-url <name> <path>', { prefix: 'none', exitCode: 129 })
      rejectNetwork(url)
      await git.deleteRemote({ fs: ctx.fs, gitdir: repo.gitdir, remote: name })
      await git.addRemote({ fs: ctx.fs, gitdir: repo.gitdir, remote: name, url: url.startsWith('/') ? url : ctx.resolve(url) })
      return
    }
    case 'prune': {
      const name = rest[0] ?? 'origin'
      const r = await fetchRemote(repo, name, { prune: true })
      ctx.out.push(...r.lines.filter((l) => l.includes('[deleted]')))
      return
    }
    default:
      throw gitErr(
        `Unknown subcommand: ${sub}\nusage: git remote [-v] | add <name> <path> | remove <name> | rename <old> <new> | show <name> | set-url <name> <path>`,
      )
  }
}

const fetch: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, { flags: { '--all': 'all', '-p': 'prune', '--prune': 'prune', '-v': 'verbose', '--tags': 'tags', '-q': 'quiet' } })
  const repo = await findRepo(ctx)
  const names = parsed.flags.has('all') ? (await repo.listRemotes()).map((r) => r.remote) : [parsed.positional[0] ?? (await defaultRemote(repo))]
  for (const name of names) {
    const r = await fetchRemote(repo, name, { prune: parsed.flags.has('prune') })
    if (!parsed.flags.has('quiet')) ctx.out.push(...r.lines)
  }
}

async function defaultRemote(repo: Awaited<ReturnType<typeof findRepo>>): Promise<string> {
  const branch = await repo.currentBranch()
  const up = branch ? await upstreamOf(repo, branch) : null
  if (up) return up.remote
  const remotes = await repo.listRemotes()
  if (remotes.length === 1) return remotes[0]!.remote
  return 'origin'
}

const pull: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--rebase': 'rebase',
      '-r': 'rebase',
      '--no-rebase': 'noRebase',
      '--ff-only': 'ffOnly',
      '--no-ff': 'noFf',
      '-q': 'quiet',
      '--autostash': 'autostash',
      '--ff': 'ff',
    },
  })
  const repo = await findRepo(ctx)
  const branch = await repo.currentBranch()
  if (!branch)
    throw fatal(
      'You are not currently on a branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>',
    )
  const up = await upstreamOf(repo, branch)
  const remoteName = parsed.positional[0] ?? up?.remote
  const remoteBranch = parsed.positional[1] ?? (parsed.positional[0] ? undefined : up?.branch)
  if (!remoteName || !remoteBranch) {
    if (!remoteName)
      throw fatal(
        `There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=<remote>/<branch> ${branch}`,
      )
    throw fatal(
      `You asked to pull from the remote '${remoteName}', but did not specify\na branch. Because this is not the default configured remote\nfor your current branch, you must specify a branch on the command line.`,
    )
  }
  const f = await fetchRemote(repo, remoteName)
  if (!parsed.flags.has('quiet')) ctx.out.push(...f.lines)
  const ref = `${remoteName}/${remoteBranch}`
  if (!(await repo.refOid(`refs/remotes/${ref}`))) throw fatal(`couldn't find remote ref ${remoteBranch}`)
  const useRebase = parsed.flags.has('rebase') || ((await repo.config('pull.rebase')) === 'true' && !parsed.flags.has('noRebase'))
  if (useRebase) {
    const r = await rebase(repo, { upstream: ref })
    ctx.reflogMessage = `pull --rebase: ${r.status}`
    ctx.out.push(...r.lines)
    ctx.events.push({ type: 'fs-changed' })
    return r.status === 'conflict' ? 1 : 0
  }
  const m = await mergeRef(repo, ref, { ffOnly: parsed.flags.has('ffOnly'), noFf: parsed.flags.has('noFf') })
  ctx.reflogMessage = m.status === 'fast-forward' ? `pull: Fast-forward` : `pull: Merge made by the 'ort' strategy.`
  ctx.out.push(...m.lines)
  ctx.events.push({ type: 'fs-changed' })
  return m.status === 'conflict' ? 1 : 0
}

const push: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '-u': 'setUpstream',
      '--set-upstream': 'setUpstream',
      '-f': 'force',
      '--force': 'force',
      '--force-with-lease': 'force',
      '--tags': 'tags',
      '-d': 'delete',
      '--delete': 'delete',
      '-q': 'quiet',
      '--all': 'all',
      '--dry-run': 'dryRun',
      '-n': 'dryRun',
    },
  })
  const repo = await findRepo(ctx)
  const [remoteName, ...refspecs] = parsed.positional
  if (parsed.flags.has('dryRun')) throw fatal('--dry-run is not available here.')
  if (parsed.flags.has('all')) {
    for (const b of await repo.listBranches()) ctx.out.push(...(await pushBranch(repo, { remote: remoteName, branch: b, force: parsed.flags.has('force') })))
    return
  }
  if (!refspecs.length) {
    const lines = await pushBranch(repo, {
      remote: remoteName,
      setUpstream: parsed.flags.has('setUpstream'),
      force: parsed.flags.has('force'),
      tags: parsed.flags.has('tags'),
    })
    if (!parsed.flags.has('quiet')) ctx.out.push(...lines)
    return
  }
  for (const spec of refspecs) {
    let ref = spec
    let remoteRef: string | undefined
    const colon = spec.indexOf(':')
    if (colon >= 0) {
      ref = spec.slice(0, colon)
      remoteRef = spec.slice(colon + 1).replace('refs/heads/', '')
    }
    if (parsed.flags.has('delete') || spec.startsWith(':')) {
      ctx.out.push(...(await pushBranch(repo, { remote: remoteName, branch: remoteRef || ref, delete: true })))
      continue
    }
    if (ref === 'HEAD') ref = (await repo.currentBranch()) ?? 'HEAD'
    if (await repo.refOid(`refs/tags/${ref}`)) {
      ctx.out.push(...(await pushTag(repo, remoteName ?? 'origin', ref)))
      continue
    }
    if (remoteRef && remoteRef !== ref) {
      // push local branch to a differently named remote branch
      const { resolveRemote: rr, copyObjects } = await import('../../git/remote')
      const { remote, url } = await rr(repo, remoteName ?? 'origin')
      const localOid = await repo.refOid(`refs/heads/${ref}`)
      if (!localOid) throw fatal(`src refspec ${ref} does not match any`)
      const remoteOid = await remote.refOid(`refs/heads/${remoteRef}`)
      if (remoteOid && !parsed.flags.has('force') && !(await repo.isAncestor(remoteOid, localOid)))
        throw fatal(`! [rejected]        ${ref} -> ${remoteRef} (non-fast-forward)\nerror: failed to push some refs to '${url}'`)
      await copyObjects(ctx.fs, repo.gitdir, remote.gitdir, localOid)
      await remote.writeRef(`refs/heads/${remoteRef}`, localOid)
      await repo.writeRef(`refs/remotes/${remoteName ?? 'origin'}/${remoteRef}`, localOid)
      ctx.out.push(
        `To ${url}`,
        remoteOid ? `   ${shortOid(remoteOid)}..${shortOid(localOid)}  ${ref} -> ${remoteRef}` : ` * [new branch]      ${ref} -> ${remoteRef}`,
      )
      continue
    }
    const lines = await pushBranch(repo, {
      remote: remoteName,
      branch: ref,
      setUpstream: parsed.flags.has('setUpstream'),
      force: parsed.flags.has('force'),
      tags: parsed.flags.has('tags'),
    })
    if (!parsed.flags.has('quiet')) ctx.out.push(...lines)
  }
}

export const remotes: Record<string, GitSubcommand> = { remote, fetch, pull, push }

export type { CommandContext }

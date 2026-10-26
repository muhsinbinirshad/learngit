/**
 * Remotes are other repositories living in the same filesystem (e.g. /remotes/team.git).
 * Objects are copied directly between object stores; refs are updated like a real push/fetch.
 */
import git from 'isomorphic-git'
import type { FsClient } from '../fs'
import { exists } from '../fs'
import { Repo, shortOid } from './repo'
import { fatal, plain } from './errors'

export class RemoteRepo {
  readonly gitdir: string
  constructor(
    readonly fs: FsClient,
    readonly url: string,
  ) {
    this.gitdir = url.endsWith('.git') ? url : `${url}/.git`
  }
  async exists(): Promise<boolean> {
    return exists(this.fs, `${this.gitdir}/HEAD`)
  }
  async refOid(ref: string): Promise<string | null> {
    try {
      return await git.resolveRef({ fs: this.fs, gitdir: this.gitdir, ref })
    } catch {
      return null
    }
  }
  async listBranches(): Promise<string[]> {
    return (await git.listBranches({ fs: this.fs, gitdir: this.gitdir })).sort()
  }
  async listTags(): Promise<string[]> {
    return (await git.listTags({ fs: this.fs, gitdir: this.gitdir })).sort()
  }
  async defaultBranch(): Promise<string> {
    try {
      const head = await git.resolveRef({ fs: this.fs, gitdir: this.gitdir, ref: 'HEAD', depth: 2 })
      if (head.startsWith('refs/heads/')) return head.slice('refs/heads/'.length)
    } catch {
      /* fallthrough */
    }
    const branches = await this.listBranches()
    return branches.includes('main') ? 'main' : (branches[0] ?? 'main')
  }
  async writeRef(ref: string, oid: string) {
    await git.writeRef({ fs: this.fs, gitdir: this.gitdir, ref, value: oid, force: true })
  }
  async deleteRef(ref: string) {
    await git.deleteRef({ fs: this.fs, gitdir: this.gitdir, ref })
  }
  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    if (ancestor === descendant) return true
    try {
      return await git.isDescendent({ fs: this.fs, gitdir: this.gitdir, oid: descendant, ancestor, depth: -1 })
    } catch {
      return false
    }
  }
}

/** Create an empty bare repository at `url` (used by labs to seed a team remote). */
export async function initBareRemote(fs: FsClient, url: string, defaultBranch = 'main'): Promise<RemoteRepo> {
  await git.init({ fs, gitdir: url, bare: true, defaultBranch })
  return new RemoteRepo(fs, url)
}

async function hasObject(fs: FsClient, gitdir: string, oid: string): Promise<boolean> {
  try {
    await git.readObject({ fs, gitdir, oid })
    return true
  } catch {
    return false
  }
}

/** Copy every object reachable from `oid` into the destination object store. */
export async function copyObjects(fs: FsClient, srcGitdir: string, dstGitdir: string, oid: string, seen = new Set<string>()): Promise<number> {
  if (seen.has(oid)) return 0
  seen.add(oid)
  if (await hasObject(fs, dstGitdir, oid)) return 0
  const { type, object } = await git.readObject({ fs, gitdir: srcGitdir, oid, format: 'parsed' })
  let count = 0
  if (type === 'commit') {
    const c = object as { tree: string; parent: string[] }
    count += await copyObjects(fs, srcGitdir, dstGitdir, c.tree, seen)
    for (const p of c.parent) count += await copyObjects(fs, srcGitdir, dstGitdir, p, seen)
  } else if (type === 'tree') {
    for (const e of object as Array<{ oid: string }>) count += await copyObjects(fs, srcGitdir, dstGitdir, e.oid, seen)
  } else if (type === 'tag') {
    count += await copyObjects(fs, srcGitdir, dstGitdir, (object as { object: string }).object, seen)
  }
  const raw = await git.readObject({ fs, gitdir: srcGitdir, oid, format: 'deflated' })
  await git.writeObject({ fs, gitdir: dstGitdir, type: type as 'blob' | 'tree' | 'commit' | 'tag', object: raw.object as Uint8Array, format: 'deflated', oid })
  return count + 1
}

export async function resolveRemote(repo: Repo, name: string): Promise<{ name: string; url: string; remote: RemoteRepo }> {
  const remotes = await repo.listRemotes()
  const entry = remotes.find((r) => r.remote === name)
  if (!entry) {
    if (remotes.length === 0 && name === 'origin')
      throw fatal(
        `'origin' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`,
      )
    throw fatal(
      `'${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`,
    )
  }
  const remote = new RemoteRepo(repo.fs, entry.url)
  if (!(await remote.exists())) throw fatal(`'${entry.url}' does not appear to be a git repository\nfatal: Could not read from remote repository.`)
  return { name, url: entry.url, remote }
}

export interface FetchResult {
  lines: string[]
  updated: { branch: string; from: string | null; to: string }[]
}

export async function fetchRemote(repo: Repo, remoteName = 'origin', opts: { prune?: boolean } = {}): Promise<FetchResult> {
  const { remote, url } = await resolveRemote(repo, remoteName)
  const lines: string[] = []
  const updated: FetchResult['updated'] = []
  const branches = await remote.listBranches()
  for (const b of branches) {
    const oid = (await remote.refOid(`refs/heads/${b}`))!
    const localRef = `refs/remotes/${remoteName}/${b}`
    const prev = await repo.refOid(localRef)
    if (prev === oid) continue
    await copyObjects(repo.fs, remote.gitdir, repo.gitdir, oid)
    await repo.writeRef(localRef, oid)
    updated.push({ branch: b, from: prev, to: oid })
  }
  for (const t of await remote.listTags()) {
    const oid = (await remote.refOid(`refs/tags/${t}`))!
    if ((await repo.refOid(`refs/tags/${t}`)) === oid) continue
    await copyObjects(repo.fs, remote.gitdir, repo.gitdir, oid)
    await repo.writeRef(`refs/tags/${t}`, oid)
    lines.push(` * [new tag]         ${t.padEnd(10)} -> ${t}`)
  }
  if (opts.prune) {
    for (const b of await repo.listRemoteBranches(remoteName)) {
      if (!branches.includes(b)) {
        await repo.deleteRef(`refs/remotes/${remoteName}/${b}`)
        lines.push(` - [deleted]         (none)     -> ${remoteName}/${b}`)
      }
    }
  }
  if (updated.length || lines.length) lines.unshift(`From ${url}`)
  for (const u of updated) {
    if (!u.from) lines.push(` * [new branch]      ${u.branch.padEnd(10)} -> ${remoteName}/${u.branch}`)
    else if (await repo.isAncestor(u.from, u.to)) lines.push(`   ${shortOid(u.from)}..${shortOid(u.to)}  ${u.branch.padEnd(10)} -> ${remoteName}/${u.branch}`)
    else lines.push(` + ${shortOid(u.from)}...${shortOid(u.to)} ${u.branch.padEnd(10)} -> ${remoteName}/${u.branch}  (forced update)`)
  }
  const fetchHead = await repo.refOid(`refs/remotes/${remoteName}/${await remote.defaultBranch()}`)
  if (fetchHead) {
    const { writeFileDeep } = await import('../fs')
    await writeFileDeep(repo.fs, `${repo.gitdir}/FETCH_HEAD`, `${fetchHead}\t\tbranch '${await remote.defaultBranch()}' of ${url}\n`)
  }
  return { lines, updated }
}

export interface PushOptions {
  remote?: string
  branch?: string
  setUpstream?: boolean
  force?: boolean
  delete?: boolean
  tags?: boolean
}

export async function pushBranch(repo: Repo, opts: PushOptions): Promise<string[]> {
  const current = await repo.currentBranch()
  let remoteName = opts.remote
  let branch = opts.branch
  if (!branch) {
    if (!current)
      throw fatal(
        'You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push origin HEAD:<name-of-remote-branch>',
      )
    branch = current
  }
  const upstreamRemote = await repo.config(`branch.${branch}.remote`)
  const upstreamMerge = await repo.config(`branch.${branch}.merge`)
  if (!remoteName) {
    if (!upstreamRemote) {
      const remotes = await repo.listRemotes()
      if (!opts.branch && remotes.length) {
        throw plain(
          `fatal: The current branch ${branch} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream ${remotes[0]!.remote} ${branch}\n\nTo have this happen automatically for branches without a tracking\nupstream, see 'push.autoSetupRemote' in 'git help config'.`,
          128,
        )
      }
      remoteName = remotes[0]?.remote ?? 'origin'
    } else {
      remoteName = upstreamRemote
    }
  }
  const { remote, url } = await resolveRemote(repo, remoteName)
  const remoteBranch = !opts.remote && upstreamMerge ? upstreamMerge.replace('refs/heads/', '') : branch
  const lines: string[] = []

  if (opts.delete) {
    const existing = await remote.refOid(`refs/heads/${remoteBranch}`)
    if (!existing) throw plain(`error: unable to delete '${remoteBranch}': remote ref does not exist\nerror: failed to push some refs to '${url}'`)
    await remote.deleteRef(`refs/heads/${remoteBranch}`)
    await repo.deleteRef(`refs/remotes/${remoteName}/${remoteBranch}`).catch(() => undefined)
    return [`To ${url}`, ` - [deleted]         ${remoteBranch}`]
  }

  const localOid = await repo.refOid(`refs/heads/${branch}`)
  if (!localOid) throw plain(`error: src refspec ${branch} does not match any\nerror: failed to push some refs to '${url}'`)
  const remoteOid = await remote.refOid(`refs/heads/${remoteBranch}`)

  if (remoteOid === localOid) {
    lines.push('Everything up-to-date')
  } else {
    if (remoteOid && !opts.force && !((await repo.hasObject(remoteOid)) && (await repo.isAncestor(remoteOid, localOid)))) {
      throw plain(
        [
          `To ${url}`,
          ` ! [rejected]        ${branch} -> ${remoteBranch} (fetch first)`,
          `error: failed to push some refs to '${url}'`,
          `hint: Updates were rejected because the remote contains work that you do not`,
          `hint: have locally. This is usually caused by another repository pushing to`,
          `hint: the same ref. If you want to integrate the remote changes, use`,
          `hint: 'git pull' before pushing again.`,
          `hint: See the 'Note about fast-forwards' in 'git push --help' for details.`,
        ].join('\n'),
      )
    }
    const count = await copyObjects(repo.fs, repo.gitdir, remote.gitdir, localOid)
    await remote.writeRef(`refs/heads/${remoteBranch}`, localOid)
    await repo.writeRef(`refs/remotes/${remoteName}/${remoteBranch}`, localOid)
    if (count) lines.push(`Enumerating objects: ${count}, done.`, `Writing objects: 100% (${count}/${count}), done.`)
    lines.push(`To ${url}`)
    if (!remoteOid) lines.push(` * [new branch]      ${branch} -> ${remoteBranch}`)
    else if (opts.force && !(await repo.isAncestor(remoteOid, localOid)))
      lines.push(` + ${shortOid(remoteOid)}...${shortOid(localOid)} ${branch} -> ${remoteBranch} (forced update)`)
    else lines.push(`   ${shortOid(remoteOid)}..${shortOid(localOid)}  ${branch} -> ${remoteBranch}`)
  }
  if (opts.tags) {
    for (const t of await repo.listTags()) {
      const oid = (await repo.refOid(`refs/tags/${t}`))!
      if ((await remote.refOid(`refs/tags/${t}`)) === oid) continue
      await copyObjects(repo.fs, repo.gitdir, remote.gitdir, oid)
      await remote.writeRef(`refs/tags/${t}`, oid)
      lines.push(` * [new tag]         ${t} -> ${t}`)
    }
  }
  if (opts.setUpstream) {
    await repo.setConfig(`branch.${branch}.remote`, remoteName)
    await repo.setConfig(`branch.${branch}.merge`, `refs/heads/${remoteBranch}`)
    lines.push(`branch '${branch}' set up to track '${remoteName}/${remoteBranch}'.`)
  }
  return lines
}

export async function pushTag(repo: Repo, remoteName: string, tag: string): Promise<string[]> {
  const { remote, url } = await resolveRemote(repo, remoteName)
  const oid = await repo.refOid(`refs/tags/${tag}`)
  if (!oid) throw plain(`error: src refspec ${tag} does not match any\nerror: failed to push some refs to '${url}'`)
  if ((await remote.refOid(`refs/tags/${tag}`)) === oid) return ['Everything up-to-date']
  await copyObjects(repo.fs, repo.gitdir, remote.gitdir, oid)
  await remote.writeRef(`refs/tags/${tag}`, oid)
  return [`To ${url}`, ` * [new tag]         ${tag} -> ${tag}`]
}

/** Clone a repository from a filesystem path into `dir`. */
export async function cloneRepo(fs: FsClient, url: string, dir: string, clock?: Repo['clock']): Promise<{ repo: Repo; lines: string[] }> {
  const remote = new RemoteRepo(fs, url)
  if (!(await remote.exists())) throw fatal(`repository '${url}' does not exist`)
  if (await exists(fs, dir)) {
    const names = await fs.promises.readdir(dir)
    if (names.length) throw fatal(`destination path '${dir}' already exists and is not an empty directory.`)
  }
  const repo = new Repo(fs, dir, clock)
  const defaultBranch = await remote.defaultBranch()
  await repo.init(defaultBranch)
  await git.addRemote({ fs, gitdir: repo.gitdir, remote: 'origin', url })
  const lines = [`Cloning into '${dir.split('/').pop()}'...`]
  const { updated } = await fetchRemote(repo, 'origin')
  const headOid = await repo.refOid(`refs/remotes/origin/${defaultBranch}`)
  if (headOid) {
    await repo.writeBranch(defaultBranch, headOid)
    await repo.setConfig(`branch.${defaultBranch}.remote`, 'origin')
    await repo.setConfig(`branch.${defaultBranch}.merge`, `refs/heads/${defaultBranch}`)
    await repo.attachHead(defaultBranch)
    const { hardCheckoutTree } = await import('./worktree')
    await hardCheckoutTree(repo, headOid)
    await repo.appendReflog('HEAD', null, headOid, `clone: from ${url}`)
  } else {
    lines.push('warning: You appear to have cloned an empty repository.')
  }
  void updated
  lines.push('done.')
  return { repo, lines }
}

/** Upstream tracking info for a branch, if configured. */
export async function upstreamOf(repo: Repo, branch: string): Promise<{ remote: string; branch: string; ref: string } | null> {
  const remote = await repo.config(`branch.${branch}.remote`)
  const merge = await repo.config(`branch.${branch}.merge`)
  if (!remote || !merge) return null
  const b = merge.replace('refs/heads/', '')
  return { remote, branch: b, ref: `refs/remotes/${remote}/${b}` }
}

/** "Your branch is ahead of 'origin/main' by 2 commits." style summary. */
export async function aheadBehind(repo: Repo, branch: string): Promise<{ upstream: string; ahead: number; behind: number } | null> {
  const up = await upstreamOf(repo, branch)
  if (!up) return null
  const local = await repo.refOid(`refs/heads/${branch}`)
  const remoteOid = await repo.refOid(up.ref)
  if (!local || !remoteOid) return null
  const { revList } = await import('./history')
  const ahead = (await revList(repo, [local], [remoteOid])).length
  const behind = (await revList(repo, [remoteOid], [local])).length
  return { upstream: `${up.remote}/${up.branch}`, ahead, behind }
}

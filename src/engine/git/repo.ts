import git, { type CommitObject, type ReadCommitResult } from 'isomorphic-git'
import type { FsClient } from '../fs'
import { exists, readTextOrNull, writeFileDeep, rmrf } from '../fs'
import { fatal } from './errors'
import { getConfigValue, resolveIdentity, type Identity } from './identity'

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
export const OID_RE = /^[0-9a-f]{4,40}$/

export interface RefInfo {
  name: string // e.g. refs/heads/main
  short: string // e.g. main
  oid: string
  kind: 'branch' | 'tag' | 'remote' | 'stash'
}

export interface ReflogEntry {
  oldOid: string
  newOid: string
  message: string
  timestamp: number
}

/** Timestamp provider; injectable so seeds and tests are deterministic. */
export interface Clock {
  now(): number // seconds since epoch
}
export const systemClock: Clock = { now: () => Math.floor(Date.now() / 1000) }

export interface RepoState {
  mergeHead: string | null
  cherryPickHead: string | null
  revertHead: string | null
  rebase: RebaseState | null
  bisect: BisectState | null
  conflicts: string[]
}

export interface RebaseTodoItem {
  action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'
  oid: string
}
export interface RebaseState {
  headName: string | null // refs/heads/x or null when detached
  onto: string
  origHead: string
  upstream: string
  todo: RebaseTodoItem[]
  done: RebaseTodoItem[]
  current: RebaseTodoItem | null
  /** When a squash/fixup chain is in progress, the accumulated message. */
  pendingMessage: string | null
  interactive: boolean
}
export interface BisectState {
  bad: string | null
  good: string[]
  startRef: string // branch name or oid to return to
  log: string[]
}

/**
 * A Git repository on an abstract filesystem. Thin plumbing over isomorphic-git plus the
 * state that isomorphic-git does not manage (reflog, merge/rebase/bisect state, conflicts).
 */
export class Repo {
  readonly gitdir: string
  readonly cache: object = {}
  clock: Clock

  constructor(
    readonly fs: FsClient,
    readonly dir: string,
    clock: Clock = systemClock,
  ) {
    this.gitdir = `${dir}/.git`
    this.clock = clock
  }

  // ---- basics -------------------------------------------------------------------------------

  async exists(): Promise<boolean> {
    return exists(this.fs, `${this.gitdir}/HEAD`)
  }

  async init(defaultBranch = 'main'): Promise<void> {
    await git.init({ fs: this.fs, dir: this.dir, defaultBranch })
  }

  async identity(): Promise<Identity> {
    return resolveIdentity(this.fs, this.gitdir)
  }

  async config(key: string): Promise<string | undefined> {
    return getConfigValue(this.fs, this.gitdir, key)
  }

  async setConfig(key: string, value: string | null): Promise<void> {
    await git.setConfig({ fs: this.fs, gitdir: this.gitdir, path: key, value: value === null ? undefined : value })
  }

  async authorSignature(extra: Partial<Identity> = {}) {
    const id = await this.identity()
    return { name: extra.name ?? id.name, email: extra.email ?? id.email, timestamp: this.clock.now(), timezoneOffset: 0 }
  }

  // ---- HEAD and refs -------------------------------------------------------------------------

  /** Branch name HEAD points at, or null when detached (or unborn branch returns the name). */
  async currentBranch(): Promise<string | null> {
    const head = (await readTextOrNull(this.fs, `${this.gitdir}/HEAD`))?.trim() ?? ''
    if (head.startsWith('ref: refs/heads/')) return head.slice('ref: refs/heads/'.length)
    return null
  }

  async isDetached(): Promise<boolean> {
    return (await this.currentBranch()) === null
  }

  /** HEAD commit oid, or null for an unborn branch. */
  async headOid(): Promise<string | null> {
    try {
      return await git.resolveRef({ fs: this.fs, gitdir: this.gitdir, ref: 'HEAD' })
    } catch {
      return null
    }
  }

  async refOid(ref: string): Promise<string | null> {
    try {
      return await git.resolveRef({ fs: this.fs, gitdir: this.gitdir, ref })
    } catch {
      return null
    }
  }

  async branchExists(name: string): Promise<boolean> {
    return (await this.refOid(`refs/heads/${name}`)) !== null
  }

  async listBranches(): Promise<string[]> {
    return (await git.listBranches({ fs: this.fs, gitdir: this.gitdir })).sort()
  }

  async listRemoteBranches(remote: string): Promise<string[]> {
    try {
      return (await git.listBranches({ fs: this.fs, gitdir: this.gitdir, remote })).filter((b) => b !== 'HEAD').sort()
    } catch {
      return []
    }
  }

  async listRemotes(): Promise<{ remote: string; url: string }[]> {
    try {
      return await git.listRemotes({ fs: this.fs, gitdir: this.gitdir })
    } catch {
      return []
    }
  }

  async listTags(): Promise<string[]> {
    return (await git.listTags({ fs: this.fs, gitdir: this.gitdir })).sort()
  }

  /** Every ref with its resolved commit oid (tags peeled). */
  async listAllRefs(): Promise<RefInfo[]> {
    const out: RefInfo[] = []
    for (const b of await this.listBranches()) {
      const oid = await this.refOid(`refs/heads/${b}`)
      if (oid) out.push({ name: `refs/heads/${b}`, short: b, oid, kind: 'branch' })
    }
    for (const t of await this.listTags()) {
      const oid = await this.peelTag(t)
      if (oid) out.push({ name: `refs/tags/${t}`, short: t, oid, kind: 'tag' })
    }
    for (const { remote } of await this.listRemotes()) {
      for (const b of await this.listRemoteBranches(remote)) {
        const oid = await this.refOid(`refs/remotes/${remote}/${b}`)
        if (oid) out.push({ name: `refs/remotes/${remote}/${b}`, short: `${remote}/${b}`, oid, kind: 'remote' })
      }
    }
    const stash = await this.refOid('refs/stash')
    if (stash) out.push({ name: 'refs/stash', short: 'stash', oid: stash, kind: 'stash' })
    return out
  }

  /** Resolve a tag to its commit (annotated tags are dereferenced). */
  async peelTag(tag: string): Promise<string | null> {
    const oid = await this.refOid(`refs/tags/${tag}`)
    if (!oid) return null
    return this.peelToCommit(oid)
  }

  async peelToCommit(oid: string): Promise<string> {
    const { type, object } = await git.readObject({ fs: this.fs, gitdir: this.gitdir, oid, cache: this.cache })
    if (type === 'tag') return this.peelToCommit((object as { object: string }).object)
    return oid
  }

  async writeBranch(name: string, oid: string): Promise<void> {
    await git.writeRef({ fs: this.fs, gitdir: this.gitdir, ref: `refs/heads/${name}`, value: oid, force: true })
  }

  async deleteBranch(name: string): Promise<void> {
    await git.deleteRef({ fs: this.fs, gitdir: this.gitdir, ref: `refs/heads/${name}` })
  }

  async writeRef(ref: string, oid: string): Promise<void> {
    await git.writeRef({ fs: this.fs, gitdir: this.gitdir, ref, value: oid, force: true })
  }

  async deleteRef(ref: string): Promise<void> {
    await git.deleteRef({ fs: this.fs, gitdir: this.gitdir, ref })
  }

  /** Point HEAD at a branch (symbolic). */
  async attachHead(branch: string): Promise<void> {
    await git.writeRef({ fs: this.fs, gitdir: this.gitdir, ref: 'HEAD', value: `refs/heads/${branch}`, symbolic: true, force: true })
  }

  /** Point HEAD directly at a commit (detached). */
  async detachHead(oid: string): Promise<void> {
    await git.writeRef({ fs: this.fs, gitdir: this.gitdir, ref: 'HEAD', value: oid, force: true })
  }

  /** Move whatever HEAD refers to (branch tip, or HEAD itself when detached) to `oid`. */
  async moveHead(oid: string): Promise<void> {
    const branch = await this.currentBranch()
    if (branch) await this.writeBranch(branch, oid)
    else await this.detachHead(oid)
  }

  // ---- objects --------------------------------------------------------------------------------

  async readCommit(oid: string): Promise<ReadCommitResult> {
    try {
      return await git.readCommit({ fs: this.fs, gitdir: this.gitdir, oid, cache: this.cache })
    } catch {
      throw fatal(`bad object ${oid}`)
    }
  }

  async readCommitSafe(oid: string): Promise<ReadCommitResult | null> {
    try {
      return await git.readCommit({ fs: this.fs, gitdir: this.gitdir, oid, cache: this.cache })
    } catch {
      return null
    }
  }

  async writeCommit(commit: CommitObject): Promise<string> {
    return git.writeCommit({ fs: this.fs, gitdir: this.gitdir, commit })
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    const { blob } = await git.readBlob({ fs: this.fs, gitdir: this.gitdir, oid, cache: this.cache })
    return blob
  }

  async readBlobText(oid: string): Promise<string> {
    return new TextDecoder().decode(await this.readBlob(oid))
  }

  async writeBlob(content: string | Uint8Array): Promise<string> {
    const blob = typeof content === 'string' ? new TextEncoder().encode(content) : content
    return git.writeBlob({ fs: this.fs, gitdir: this.gitdir, blob })
  }

  async hasObject(oid: string): Promise<boolean> {
    try {
      await git.readObject({ fs: this.fs, gitdir: this.gitdir, oid, cache: this.cache })
      return true
    } catch {
      return false
    }
  }

  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    if (ancestor === descendant) return true
    try {
      return await git.isDescendent({ fs: this.fs, gitdir: this.gitdir, oid: descendant, ancestor, depth: -1, cache: this.cache })
    } catch {
      return false
    }
  }

  async mergeBase(a: string, b: string): Promise<string | null> {
    const bases = await git.findMergeBase({ fs: this.fs, gitdir: this.gitdir, oids: [a, b], cache: this.cache })
    return (bases[0] as string | undefined) ?? null
  }

  // ---- revisions -------------------------------------------------------------------------------

  /**
   * Resolve a revision expression to a commit oid.
   * Supports: HEAD, branch, tag, remote/branch, abbreviated oids, `~n`, `^`, `@{n}` reflog, `stash@{n}`.
   */
  async resolveRevision(rev: string): Promise<string> {
    const original = rev
    // Split off trailing ~n / ^ operators.
    const ops: string[] = []
    const opRe = /(~\d*|\^\d*)$/
    let m: RegExpExecArray | null
    while ((m = opRe.exec(rev))) {
      ops.unshift(m[1]!)
      rev = rev.slice(0, -m[1]!.length)
    }
    let oid = await this.resolveBase(rev, original)
    for (const op of ops) {
      if (op.startsWith('~')) {
        const n = op.length > 1 ? parseInt(op.slice(1), 10) : 1
        for (let i = 0; i < n; i++) oid = await this.firstParent(oid, original)
      } else {
        const n = op.length > 1 ? parseInt(op.slice(1), 10) : 1
        if (n === 0) continue
        const c = await this.readCommit(oid)
        const p = c.commit.parent[n - 1]
        if (!p) throw fatal(`ambiguous argument '${original}': unknown revision or path not in the working tree.`)
        oid = p
      }
    }
    return oid
  }

  private async firstParent(oid: string, original: string): Promise<string> {
    const c = await this.readCommit(oid)
    const p = c.commit.parent[0]
    if (!p) throw fatal(`ambiguous argument '${original}': unknown revision or path not in the working tree.`)
    return p
  }

  private async resolveBase(rev: string, original: string): Promise<string> {
    const notFound = () =>
      fatal(
        `ambiguous argument '${original}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`,
      )
    if (rev === '' || rev === '@') rev = 'HEAD'
    const reflogRef = /^(.+)@\{(\d+)\}$/.exec(rev)
    if (reflogRef) {
      const [, name, idx] = reflogRef
      const entries = await this.readReflog(name === 'HEAD' || name === '@' ? 'HEAD' : name === 'stash' ? 'refs/stash' : `refs/heads/${name}`)
      const entry = entries[parseInt(idx!, 10)]
      if (!entry) throw fatal(`log for '${name}' only has ${entries.length} entries`)
      return name === 'stash' ? entry.newOid : entry.newOid
    }
    if (rev === 'HEAD') {
      const oid = await this.headOid()
      if (!oid) throw fatal(`ambiguous argument 'HEAD': unknown revision or path not in the working tree.`)
      return oid
    }
    if (rev === 'ORIG_HEAD' || rev === 'MERGE_HEAD' || rev === 'CHERRY_PICK_HEAD' || rev === 'REVERT_HEAD' || rev === 'FETCH_HEAD') {
      const v = (await readTextOrNull(this.fs, `${this.gitdir}/${rev}`))?.trim().split(/\s/)[0]
      if (!v) throw notFound()
      return v
    }
    if (rev === 'stash') {
      const oid = await this.refOid('refs/stash')
      if (!oid) throw notFound()
      return oid
    }
    for (const candidate of [`refs/heads/${rev}`, `refs/tags/${rev}`, `refs/remotes/${rev}`, rev]) {
      const oid = await this.refOid(candidate)
      if (oid) return this.peelToCommit(oid)
    }
    if (OID_RE.test(rev)) {
      try {
        const full = rev.length === 40 ? rev : await git.expandOid({ fs: this.fs, gitdir: this.gitdir, oid: rev, cache: this.cache })
        if (await this.hasObject(full)) return this.peelToCommit(full)
      } catch {
        /* fallthrough */
      }
    }
    throw notFound()
  }

  // ---- reflog ---------------------------------------------------------------------------------

  async appendReflog(ref: string, oldOid: string | null, newOid: string, message: string): Promise<void> {
    let id: Identity = { name: 'Commit Lab', email: 'lab@commitlab.local' }
    try {
      id = await this.identity()
    } catch {
      /* identity optional for reflog */
    }
    const path = `${this.gitdir}/logs/${ref}`
    const prev = (await readTextOrNull(this.fs, path)) ?? ''
    const line = `${oldOid ?? '0'.repeat(40)} ${newOid} ${id.name} <${id.email}> ${this.clock.now()} +0000\t${message}\n`
    await writeFileDeep(this.fs, path, prev + line)
  }

  /** Newest first, like `git reflog`. */
  async readReflog(ref: string): Promise<ReflogEntry[]> {
    const text = await readTextOrNull(this.fs, `${this.gitdir}/logs/${ref}`)
    if (!text) return []
    const entries: ReflogEntry[] = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      const tab = line.indexOf('\t')
      const head = line.slice(0, tab).split(' ')
      const message = line.slice(tab + 1)
      const tsMatch = /(\d+) [+-]\d{4}$/.exec(line.slice(0, tab))
      entries.push({ oldOid: head[0]!, newOid: head[1]!, message, timestamp: tsMatch ? parseInt(tsMatch[1]!, 10) : 0 })
    }
    return entries.reverse()
  }

  async writeReflogAll(ref: string, entries: ReflogEntry[], identity: Identity): Promise<void> {
    const path = `${this.gitdir}/logs/${ref}`
    if (!entries.length) {
      await rmrf(this.fs, path)
      return
    }
    const lines = [...entries].reverse().map((e) => `${e.oldOid} ${e.newOid} ${identity.name} <${identity.email}> ${e.timestamp} +0000\t${e.message}\n`)
    await writeFileDeep(this.fs, path, lines.join(''))
  }

  // ---- in-progress operation state -------------------------------------------------------------

  private async readStateFile(name: string): Promise<string | null> {
    const t = await readTextOrNull(this.fs, `${this.gitdir}/${name}`)
    return t ? t.trim() : null
  }
  private async writeStateFile(name: string, value: string | null): Promise<void> {
    const path = `${this.gitdir}/${name}`
    if (value === null) await rmrf(this.fs, path)
    else await writeFileDeep(this.fs, path, value.endsWith('\n') ? value : value + '\n')
  }

  async getMergeHead() {
    return this.readStateFile('MERGE_HEAD')
  }
  async setMergeHead(oid: string | null) {
    await this.writeStateFile('MERGE_HEAD', oid)
  }
  async getMergeMsg() {
    return this.readStateFile('MERGE_MSG')
  }
  async setMergeMsg(msg: string | null) {
    await this.writeStateFile('MERGE_MSG', msg)
  }
  async getCherryPickHead() {
    return this.readStateFile('CHERRY_PICK_HEAD')
  }
  async setCherryPickHead(oid: string | null) {
    await this.writeStateFile('CHERRY_PICK_HEAD', oid)
  }
  async getRevertHead() {
    return this.readStateFile('REVERT_HEAD')
  }
  async setRevertHead(oid: string | null) {
    await this.writeStateFile('REVERT_HEAD', oid)
  }
  async setOrigHead(oid: string | null) {
    await this.writeStateFile('ORIG_HEAD', oid)
  }
  async getOrigHead() {
    return this.readStateFile('ORIG_HEAD')
  }

  async getConflicts(): Promise<string[]> {
    const t = await this.readStateFile('COMMITLAB_CONFLICTS')
    return t ? (JSON.parse(t) as string[]) : []
  }
  async setConflicts(paths: string[]): Promise<void> {
    await this.writeStateFile('COMMITLAB_CONFLICTS', paths.length ? JSON.stringify(paths) : null)
  }
  async clearConflict(path: string): Promise<void> {
    const c = await this.getConflicts()
    if (c.includes(path)) await this.setConflicts(c.filter((p) => p !== path))
  }

  async getRebaseState(): Promise<RebaseState | null> {
    const t = await this.readStateFile('rebase-merge/state.json')
    return t ? (JSON.parse(t) as RebaseState) : null
  }
  async setRebaseState(state: RebaseState | null): Promise<void> {
    if (state === null) await rmrf(this.fs, `${this.gitdir}/rebase-merge`)
    else await this.writeStateFile('rebase-merge/state.json', JSON.stringify(state))
  }

  async getBisectState(): Promise<BisectState | null> {
    const t = await this.readStateFile('BISECT_STATE.json')
    return t ? (JSON.parse(t) as BisectState) : null
  }
  async setBisectState(state: BisectState | null): Promise<void> {
    await this.writeStateFile('BISECT_STATE.json', state ? JSON.stringify(state) : null)
  }

  async state(): Promise<RepoState> {
    return {
      mergeHead: await this.getMergeHead(),
      cherryPickHead: await this.getCherryPickHead(),
      revertHead: await this.getRevertHead(),
      rebase: await this.getRebaseState(),
      bisect: await this.getBisectState(),
      conflicts: await this.getConflicts(),
    }
  }

  /** Remove all in-progress markers (after abort / completion). */
  async clearOperationState(): Promise<void> {
    await this.setMergeHead(null)
    await this.setMergeMsg(null)
    await this.setCherryPickHead(null)
    await this.setRevertHead(null)
    await this.setConflicts([])
  }
}

export function shortOid(oid: string, n = 7): string {
  return oid.slice(0, n)
}

export function subjectOf(message: string): string {
  return message.split('\n')[0] ?? ''
}

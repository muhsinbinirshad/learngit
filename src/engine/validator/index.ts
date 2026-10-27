import type { FsClient } from '../fs'
import { exists, readTextOrNull } from '../fs'
import { Repo } from '../git/repo'
import { readFlatTree, readIndex, readFileAtCommit, commitTreeOid } from '../git/tree'
import { computeStatus, isIgnored } from '../git/worktree'
import { revList } from '../git/history'
import { hasConflictMarkers } from '../git/merge'
import { readGlobalConfig } from '../git/identity'
import { stashList } from '../git/stash'
import { subjectOf } from '../git/repo'
import type { Check, Objective } from '../scenario/types'

export interface ValidationContext {
  fs: FsClient
  repoDir: string
  /** Commit oids recorded by labeled seed steps. */
  labels: Record<string, string>
}

export interface ObjectiveResult {
  id: string
  met: boolean
  /** Why the check failed (for debugging/authoring; not shown to learners). */
  reason?: string
}

export class CheckFailure extends Error {}

function fail(reason: string): never {
  throw new CheckFailure(reason)
}

/** Replace `{{label:name}}` / `{{label:name:short}}` in patterns and text. */
export function interpolate(text: string, labels: Record<string, string>): string {
  return text.replace(/\{\{label:([\w-]+)(?::(short))?\}\}/g, (_, name: string, short?: string) => {
    const oid = labels[name]
    if (!oid) return `<unknown label ${name}>`
    return short ? oid.slice(0, 7) : oid
  })
}

async function resolveRef(repo: Repo, ctx: ValidationContext, ref: string | undefined): Promise<string> {
  const r = ref ?? 'HEAD'
  if (r.startsWith('label:')) {
    const oid = ctx.labels[r.slice(6)]
    if (!oid) fail(`unknown label ${r}`)
    return oid
  }
  try {
    return await repo.resolveRevision(r)
  } catch {
    fail(`revision '${r}' does not resolve`)
  }
}

function re(pattern: string, flags: string | undefined, labels: Record<string, string>): RegExp {
  return new RegExp(interpolate(pattern, labels), flags ?? '')
}

async function fileText(repo: Repo, ctx: ValidationContext, path: string, ref?: string): Promise<string | null> {
  if (ref) {
    const oid = await resolveRef(repo, ctx, ref)
    return readFileAtCommit(repo, oid, path)
  }
  return readTextOrNull(ctx.fs, `${repo.dir}/${path}`)
}

async function commitsOf(repo: Repo, ctx: ValidationContext, ref?: string, exclude?: string) {
  const oid = await resolveRef(repo, ctx, ref)
  const ex = exclude ? [await resolveRef(repo, ctx, exclude)] : []
  return revList(repo, [oid], ex)
}

export async function evaluateCheck(check: Check, ctx: ValidationContext): Promise<void> {
  const repo = new Repo(ctx.fs, ctx.repoDir)
  const repoExists = await repo.exists()
  const needRepo = () => {
    if (!repoExists) fail('no repository')
  }
  switch (check.type) {
    case 'all':
      for (const c of check.checks) await evaluateCheck(c, ctx)
      return
    case 'any': {
      const reasons: string[] = []
      for (const c of check.checks) {
        try {
          await evaluateCheck(c, ctx)
          return
        } catch (e) {
          reasons.push(e instanceof Error ? e.message : String(e))
        }
      }
      fail(`none matched: ${reasons.join('; ')}`)
    }
    // eslint-disable-next-line no-fallthrough
    case 'not': {
      const passed = await evaluateCheck(check.check, ctx)
        .then(() => true)
        .catch(() => false)
      if (passed) fail('inner check unexpectedly passed')
      return
    }
    case 'branchExists':
      needRepo()
      if (!(await repo.branchExists(check.name))) fail(`branch ${check.name} missing`)
      return
    case 'branchNotExists':
      needRepo()
      if (await repo.branchExists(check.name)) fail(`branch ${check.name} exists`)
      return
    case 'headOnBranch':
      needRepo()
      if ((await repo.currentBranch()) !== check.name) fail(`HEAD is on ${await repo.currentBranch()}`)
      return
    case 'headDetached':
      needRepo()
      if (!(await repo.isDetached()) || !(await repo.headOid())) fail('HEAD is attached')
      return
    case 'headEquals': {
      needRepo()
      const h = await repo.headOid()
      if (h !== (await resolveRef(repo, ctx, check.ref))) fail('HEAD differs')
      return
    }
    case 'commitCount': {
      needRepo()
      const n = (await commitsOf(repo, ctx, check.ref, check.exclude)).length
      if (check.exact !== undefined && n !== check.exact) fail(`count ${n} != ${check.exact}`)
      if (check.min !== undefined && n < check.min) fail(`count ${n} < ${check.min}`)
      if (check.max !== undefined && n > check.max) fail(`count ${n} > ${check.max}`)
      return
    }
    case 'commitMessageMatches': {
      needRepo()
      const commits = await commitsOf(repo, ctx, check.ref, check.exclude)
      const r = re(check.pattern, check.flags, ctx.labels)
      const which = check.which ?? 'head'
      if (which === 'head') {
        if (!commits[0] || !r.test(commits[0].message)) fail('head message does not match')
      } else if (which === 'any') {
        if (!commits.some((c) => r.test(c.message))) fail('no commit message matches')
      } else {
        if (!commits.length || !commits.every((c) => r.test(c.message))) fail('some commit message does not match')
      }
      return
    }
    case 'commitMessageFormat': {
      needRepo()
      const commits = await commitsOf(repo, ctx, check.ref, check.exclude)
      const targets = (check.which ?? 'head') === 'head' ? commits.slice(0, 1) : commits
      if (!targets.length) fail('no commits')
      for (const c of targets) {
        const lines = c.message.replace(/\n+$/, '').split('\n')
        const subject = lines[0] ?? ''
        if (!subject.trim()) fail('empty subject')
        if (check.maxSubject && subject.length > check.maxSubject) fail(`subject longer than ${check.maxSubject}`)
        if (check.noTrailingPeriod && /\.$/.test(subject.trim())) fail('subject ends with a period')
        if (check.requireBlankLine && lines.length > 1 && lines[1]!.trim() !== '') fail('no blank line after subject')
      }
      return
    }
    case 'commitAuthor': {
      needRepo()
      const oid = await resolveRef(repo, ctx, check.ref)
      const { commit } = await repo.readCommit(oid)
      const r = re(check.pattern, undefined, ctx.labels)
      if (!r.test(commit.author.name) && !r.test(commit.author.email)) fail('author mismatch')
      return
    }
    case 'commitTouchesOnly': {
      needRepo()
      const oid = await resolveRef(repo, ctx, check.ref)
      const { commit } = await repo.readCommit(oid)
      const parentTree = await readFlatTree(repo, commit.parent[0] ?? null)
      const tree = await readFlatTree(repo, oid)
      const changed = new Set<string>()
      for (const [p, e] of tree) if (parentTree.get(p)?.oid !== e.oid) changed.add(p)
      for (const p of parentTree.keys()) if (!tree.has(p)) changed.add(p)
      const allowed = new Set(check.paths)
      for (const p of changed) if (!allowed.has(p)) fail(`commit also touches ${p}`)
      if (!changed.size) fail('commit changes nothing')
      return
    }
    case 'commitChangesPath': {
      needRepo()
      const oid = await resolveRef(repo, ctx, check.ref)
      const { commit } = await repo.readCommit(oid)
      const parentTree = await readFlatTree(repo, commit.parent[0] ?? null)
      const tree = await readFlatTree(repo, oid)
      if (parentTree.get(check.path)?.oid === tree.get(check.path)?.oid) fail(`${check.path} unchanged`)
      return
    }
    case 'headIsMergeCommit': {
      needRepo()
      const oid = await resolveRef(repo, ctx, check.ref)
      const { commit } = await repo.readCommit(oid)
      if (commit.parent.length < 2) fail('not a merge commit')
      return
    }
    case 'mergeCommitWithParent': {
      needRepo()
      const parent = await resolveRef(repo, ctx, check.parent)
      const commits = await commitsOf(repo, ctx, check.ref)
      const position = check.position ?? 'any'
      const matches = commits.some((c) => {
        if (c.parents.length < 2) return false
        if (position === 'first') return c.parents[0] === parent
        if (position === 'nonFirst') return c.parents.slice(1).includes(parent)
        return c.parents.includes(parent)
      })
      if (!matches) fail('no merge commit with that parent')
      return
    }
    case 'linearHistory': {
      needRepo()
      const commits = await commitsOf(repo, ctx, check.ref, check.upstream)
      if (commits.some((c) => c.parents.length > 1)) fail('history contains a merge commit')
      if (check.upstream) {
        const up = await resolveRef(repo, ctx, check.upstream)
        const head = await resolveRef(repo, ctx, check.ref)
        if (!(await repo.isAncestor(up, head))) fail('ref does not contain upstream')
      }
      return
    }
    case 'refContains': {
      needRepo()
      const target = await resolveRef(repo, ctx, check.target)
      const ref = await resolveRef(repo, ctx, check.ref)
      if (!(await repo.isAncestor(target, ref))) fail(`${check.ref} does not contain ${check.target}`)
      return
    }
    case 'refsEqual': {
      needRepo()
      if ((await resolveRef(repo, ctx, check.a)) !== (await resolveRef(repo, ctx, check.b))) fail('refs differ')
      return
    }
    case 'tagExists': {
      needRepo()
      const oid = await repo.refOid(`refs/tags/${check.name}`)
      if (!oid) fail(`tag ${check.name} missing`)
      if (check.annotated) {
        const g = (await import('isomorphic-git')).default
        const obj = await g.readObject({ fs: ctx.fs, gitdir: repo.gitdir, oid })
        if (obj.type !== 'tag') fail('tag is lightweight')
      }
      if (check.ref) {
        const peeled = await repo.peelToCommit(oid)
        if (peeled !== (await resolveRef(repo, ctx, check.ref))) fail('tag points elsewhere')
      }
      return
    }
    case 'fileExists': {
      if (check.ref) {
        needRepo()
        const tree = await readFlatTree(repo, await resolveRef(repo, ctx, check.ref))
        if (!tree.has(check.path)) fail(`${check.path} not in ${check.ref}`)
      } else if (!(await exists(ctx.fs, `${ctx.repoDir}/${check.path}`))) fail(`${check.path} missing`)
      return
    }
    case 'fileNotExists': {
      if (check.ref) {
        needRepo()
        const tree = await readFlatTree(repo, await resolveRef(repo, ctx, check.ref))
        if (tree.has(check.path)) fail(`${check.path} in ${check.ref}`)
      } else if (await exists(ctx.fs, `${ctx.repoDir}/${check.path}`)) fail(`${check.path} exists`)
      return
    }
    case 'fileContains': {
      if (check.ref) needRepo()
      const text = await fileText(repo, ctx, check.path, check.ref)
      if (text === null) fail(`${check.path} missing`)
      if (!re(check.pattern, check.flags, ctx.labels).test(text)) fail(`${check.path} does not match ${check.pattern}`)
      return
    }
    case 'fileNotContains': {
      if (check.ref) needRepo()
      const text = await fileText(repo, ctx, check.path, check.ref)
      if (text !== null && re(check.pattern, check.flags, ctx.labels).test(text)) fail(`${check.path} matches ${check.pattern}`)
      return
    }
    case 'fileTracked': {
      needRepo()
      if (check.ref) {
        const tree = await readFlatTree(repo, await resolveRef(repo, ctx, check.ref))
        if (!tree.has(check.path)) fail('not tracked at ref')
      } else {
        const index = await readIndex(repo)
        if (!index.has(check.path)) fail('not in index')
      }
      return
    }
    case 'fileNotTracked': {
      needRepo()
      if (check.ref) {
        const tree = await readFlatTree(repo, await resolveRef(repo, ctx, check.ref))
        if (tree.has(check.path)) fail('tracked at ref')
      } else {
        const index = await readIndex(repo)
        if (index.has(check.path)) fail('in index')
      }
      return
    }
    case 'fileStaged': {
      needRepo()
      const st = await computeStatus(repo)
      if (!st.staged.some((e) => e.path === check.path)) fail('not staged')
      return
    }
    case 'fileHasUnstagedChanges': {
      needRepo()
      const st = await computeStatus(repo)
      if (!st.unstaged.some((e) => e.path === check.path) && !st.untracked.some((e) => e.path === check.path)) fail('no unstaged changes')
      return
    }
    case 'fileIgnored': {
      needRepo()
      if (!(await isIgnored(repo, check.path))) fail(`${check.path} not ignored`)
      return
    }
    case 'workingTreeClean': {
      needRepo()
      const st = await computeStatus(repo)
      if (!st.clean) fail('working tree dirty: ' + st.entries.map((e) => e.path).join(', '))
      return
    }
    case 'noStagedChanges': {
      needRepo()
      const st = await computeStatus(repo)
      if (st.staged.length) fail('staged changes present')
      return
    }
    case 'noConflictMarkers': {
      const text = await readTextOrNull(ctx.fs, `${ctx.repoDir}/${check.path}`)
      if (text !== null && hasConflictMarkers(text)) fail('conflict markers present')
      return
    }
    case 'noConflicts': {
      needRepo()
      if ((await repo.getConflicts()).length) fail('unresolved conflicts')
      return
    }
    case 'noOperationInProgress': {
      needRepo()
      const s = await repo.state()
      if (s.mergeHead || s.cherryPickHead || s.revertHead || s.rebase || s.bisect) fail('operation in progress')
      return
    }
    case 'stashCount': {
      needRepo()
      const n = (await stashList(repo)).length
      if (check.min !== undefined && n < check.min) fail(`stash count ${n}`)
      if (check.max !== undefined && n > check.max) fail(`stash count ${n}`)
      return
    }
    case 'configSet': {
      const scope = check.scope ?? 'any'
      let value: string | undefined
      if (scope === 'global') value = (await readGlobalConfig(ctx.fs))[check.key]
      else if (scope === 'local') {
        needRepo()
        const g = (await import('isomorphic-git')).default
        value = (await g.getConfig({ fs: ctx.fs, gitdir: repo.gitdir, path: check.key })) as string | undefined
      } else value = repoExists ? await repo.config(check.key) : (await readGlobalConfig(ctx.fs))[check.key]
      if (!value) fail(`${check.key} unset`)
      if (check.pattern && !re(check.pattern, undefined, ctx.labels).test(value)) fail(`${check.key} mismatch`)
      return
    }
    case 'reflogContains': {
      needRepo()
      const entries = await repo.readReflog('HEAD')
      const r = re(check.pattern, undefined, ctx.labels)
      if (!entries.some((e) => r.test(e.message))) fail('no reflog entry matches')
      return
    }
    case 'remoteBranchExists': {
      needRepo()
      const { resolveRemote } = await import('../git/remote')
      const { remote } = await resolveRemote(repo, check.remote)
      if (!(await remote.refOid(`refs/heads/${check.branch}`))) fail('remote branch missing')
      return
    }
    case 'remoteBranchEquals': {
      needRepo()
      const { resolveRemote } = await import('../git/remote')
      const { remote } = await resolveRemote(repo, check.remote)
      const oid = await remote.refOid(`refs/heads/${check.branch}`)
      if (oid !== (await resolveRef(repo, ctx, check.ref))) fail('remote branch differs')
      return
    }
    default: {
      const never: never = check
      fail(`unknown check ${(never as { type: string }).type}`)
    }
  }
}

export async function evaluateObjective(objective: Objective, ctx: ValidationContext): Promise<ObjectiveResult> {
  try {
    await evaluateCheck(objective.check, ctx)
    return { id: objective.id, met: true }
  } catch (e) {
    return { id: objective.id, met: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function evaluateObjectives(objectives: Objective[], ctx: ValidationContext): Promise<ObjectiveResult[]> {
  const out: ObjectiveResult[] = []
  for (const o of objectives) out.push(await evaluateObjective(o, ctx))
  return out
}

/** Merge fresh results with previously-met sticky objectives. */
export function applyStickiness(objectives: Objective[], previous: Record<string, boolean>, fresh: ObjectiveResult[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const o of objectives) {
    const now = fresh.find((r) => r.id === o.id)?.met ?? false
    out[o.id] = (o.sticky ?? true) ? now || !!previous[o.id] : now
  }
  return out
}

export { commitTreeOid, subjectOf }
export * from './provider'

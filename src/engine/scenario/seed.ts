import git from 'isomorphic-git'
import type { FsClient } from '../fs'
import { mkdirp, rmrf, writeFileDeep, readTextOrNull } from '../fs'
import { Repo, type Clock } from '../git/repo'
import { setGlobalConfig } from '../git/identity'
import { createCommit } from '../git/commit'
import { switchTo } from '../git/checkout'
import { mergeRef } from '../git/integrate'
import { stagePath, removeFromIndex, computeStatus } from '../git/worktree'
import { stashPush } from '../git/stash'
import { resetTo } from '../git/reset'
import { initBareRemote, pushBranch } from '../git/remote'
import { Shell } from '../shell/shell'
import { loadSeedPack } from './pack'
import type { LabDefinition, Persona, SeedStep } from './types'

export const DEFAULT_IDENTITY: Persona = { name: 'Sam Okafor', email: 'sam.okafor@example.dev', role: 'Software Engineer' }

export interface SeedResult {
  repoDir: string
  cwd: string
  labels: Record<string, string>
}

export const LABELS_FILE = 'COMMITLAB_LABELS.json'

/** A clock that advances by a fixed step on each read, so seeded history has readable, ordered dates. */
export class SeedClock implements Clock {
  private t: number
  constructor(
    startIso: string,
    private readonly stepSeconds: number,
  ) {
    this.t = Math.floor(new Date(startIso).getTime() / 1000)
  }
  now(): number {
    const v = this.t
    this.t += this.stepSeconds
    return v
  }
  peek(): number {
    return this.t
  }
}

/**
 * Build the lab's starting state from its seed steps. Everything goes through the real engine,
 * so seeded repositories are indistinguishable from ones a learner would have built.
 */
export async function seedLab(fs: FsClient, lab: LabDefinition, home: string): Promise<SeedResult> {
  const repoDir = `${home}/${lab.workspace.projectDir}`
  await rmrf(fs, repoDir)
  await mkdirp(fs, repoDir)
  const identity = lab.workspace.identity === undefined ? DEFAULT_IDENTITY : lab.workspace.identity
  await setGlobalConfig(fs, 'user.name', identity?.name ?? null)
  await setGlobalConfig(fs, 'user.email', identity?.email ?? null)

  // A seed pack rebuilds the repository from a snapshot (files + history + refs). Its `steps`, if
  // any, then run on top of the loaded repo — e.g. to leave uncommitted work or a half-done branch.
  if (lab.seed.pack) await loadSeedPack(fs, repoDir, lab.seed.pack)

  const clock = new SeedClock(lab.seed.startDate ?? '2026-03-02T09:00:00Z', (lab.seed.stepMinutes ?? 37) * 60)
  const repo = new Repo(fs, repoDir, clock)
  const labels: Record<string, string> = { ...(lab.seed.pack?.manifest.labels ?? {}) }
  const cast = lab.cast ?? {}
  const learner = identity ?? DEFAULT_IDENTITY

  const ensureRepo = async () => {
    if (!(await repo.exists())) await repo.init('main')
  }
  const authorFor = (key?: string) => {
    if (!key || key === 'you' || key === 'learner') return learner
    const p = cast[key]
    if (!p) throw new Error(`seed: unknown cast member '${key}' in lab ${lab.id}`)
    return p
  }
  const stageAll = async () => {
    const st = await computeStatus(repo)
    for (const e of st.entries) {
      if (e.unstaged === 'deleted') await removeFromIndex(repo, e.path)
      else if (e.untracked || e.unstaged || e.conflicted) await stagePath(repo, e.path, true)
    }
  }

  for (const step of (lab.seed.steps ?? []) as SeedStep[]) {
    switch (step.type) {
      case 'file':
        await writeFileDeep(fs, `${repoDir}/${step.path}`, step.content)
        break
      case 'delete':
        await rmrf(fs, `${repoDir}/${step.path}`)
        break
      case 'commit': {
        await ensureRepo()
        for (const [p, c] of Object.entries(step.files ?? {})) await writeFileDeep(fs, `${repoDir}/${p}`, c)
        for (const p of step.delete ?? []) await rmrf(fs, `${repoDir}/${p}`)
        await stageAll()
        const author = authorFor(step.author)
        // Seeded commits are authored by the cast member; the committer is the same person.
        const saved = { name: await repo.config('user.name'), email: await repo.config('user.email') }
        await repo.setConfig('user.name', author.name)
        await repo.setConfig('user.email', author.email)
        const ts = clock.now()
        const result = await createCommit(repo, { message: step.message, author: { ...author, timestamp: ts }, allowEmpty: step.allowEmpty })
        await repo.setConfig('user.name', saved.name ?? null)
        await repo.setConfig('user.email', saved.email ?? null)
        const prev = (await repo.readReflog('HEAD'))[0]?.newOid ?? null
        await repo.appendReflog('HEAD', prev, result.oid, `commit${result.isInitial ? ' (initial)' : ''}: ${step.message.split('\n')[0]}`)
        if (step.label) labels[step.label] = result.oid
        break
      }
      case 'branch': {
        await ensureRepo()
        const oid = await repo.resolveRevision(step.from ?? 'HEAD')
        await repo.writeBranch(step.name, oid)
        break
      }
      case 'checkout': {
        await ensureRepo()
        const from = (await repo.currentBranch()) ?? 'HEAD'
        const r = await switchTo(repo, step.ref, { create: step.create ? step.ref : undefined, detach: step.detach })
        const prev = await repo.headOid()
        await repo.appendReflog('HEAD', prev, (await repo.headOid())!, `checkout: moving from ${from} to ${r.target}`)
        break
      }
      case 'merge': {
        await ensureRepo()
        const before = await repo.headOid()
        const r = await mergeRef(repo, step.ref, { message: step.message })
        if (r.status === 'conflict') throw new Error(`seed: merge of ${step.ref} conflicted in lab ${lab.id}`)
        await repo.appendReflog(
          'HEAD',
          before,
          (await repo.headOid())!,
          `merge ${step.ref}: ${r.status === 'fast-forward' ? 'Fast-forward' : "Merge made by the 'ort' strategy."}`,
        )
        break
      }
      case 'tag': {
        await ensureRepo()
        const oid = await repo.resolveRevision(step.ref ?? 'HEAD')
        if (step.message) {
          await git.annotatedTag({
            fs,
            gitdir: repo.gitdir,
            ref: step.name,
            object: oid,
            message: step.message,
            tagger: { ...learner, timestamp: clock.now(), timezoneOffset: 0 },
          })
        } else await git.tag({ fs, gitdir: repo.gitdir, ref: step.name, object: oid })
        break
      }
      case 'stage':
        await ensureRepo()
        for (const p of step.paths) await stagePath(repo, p, true)
        break
      case 'stash':
        await ensureRepo()
        await stashPush(repo, step.message)
        break
      case 'config':
        if (step.global) await setGlobalConfig(fs, step.key, step.value)
        else {
          await ensureRepo()
          await repo.setConfig(step.key, step.value)
        }
        break
      case 'remote': {
        await ensureRepo()
        const path = step.path.startsWith('/') ? step.path : `${home}/${step.path}`
        await rmrf(fs, path)
        await initBareRemote(fs, path)
        await git.addRemote({ fs, gitdir: repo.gitdir, remote: step.name, url: path })
        break
      }
      case 'push':
        await ensureRepo()
        await pushBranch(repo, { remote: step.remote, branch: step.branch, setUpstream: step.setUpstream ?? true })
        break
      case 'reset': {
        await ensureRepo()
        const before = await repo.headOid()
        await resetTo(repo, step.mode, step.ref)
        await repo.appendReflog('HEAD', before, (await repo.headOid())!, `reset: moving to ${step.ref}`)
        break
      }
      case 'shell': {
        const shell = new Shell({ fs, home, cwd: repoDir, io: { openEditor: async (r) => r.content }, clock })
        const r = await shell.run(step.command)
        if (r.exitCode !== 0) throw new Error(`seed: shell step failed in lab ${lab.id}: ${step.command}\n${r.output.join('\n')}`)
        break
      }
      default: {
        const never: never = step
        throw new Error(`seed: unknown step ${(never as { type: string }).type}`)
      }
    }
  }
  await writeFileDeep(fs, labelsPath(home, lab.id), JSON.stringify(labels))
  return { repoDir, cwd: repoDir, labels }
}

/** Labels live outside the project so they never show up as untracked files. */
export function labelsPath(home: string, labId: string): string {
  return `${home}/.commitlab/${labId}/${LABELS_FILE}`
}

export async function readLabels(fs: FsClient, home: string, labId: string): Promise<Record<string, string>> {
  const text = await readTextOrNull(fs, labelsPath(home, labId))
  return text ? (JSON.parse(text) as Record<string, string>) : {}
}

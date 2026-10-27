import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMemoryFs } from '@/engine/fs/memory'
import { loadSeedPack, type SeedPack } from '@/engine/scenario/pack'
import { Repo } from '@/engine/git/repo'
import { readFileAtCommit } from '@/engine/git/tree'
import { revList } from '@/engine/git/history'
import { computeStatus } from '@/engine/git/worktree'

const PACKS = join(process.cwd(), 'src', 'content', 'packs')
const HOME = '/home/learner'
const DIR = `${HOME}/ledgerly`

function readPack(name: string): SeedPack {
  return JSON.parse(readFileSync(join(PACKS, `${name}.json`), 'utf8')) as SeedPack
}

async function load(name: string) {
  const fs = createMemoryFs()
  const pack = readPack(name)
  await loadSeedPack(fs, DIR, pack)
  return { fs, pack, repo: new Repo(fs, DIR) }
}

describe('Ledgerly seed packs load with correct graphs', () => {
  it('every pack reconstructs its HEAD and refs exactly', async () => {
    for (const name of ['t1-first-day', 't2-merge-conflict', 't4-rebase', 't5-bisect', 't6-secret', 'ledgerly-main']) {
      const { repo, pack } = await load(name)
      expect(await repo.headOid(), `${name} head`).toBe(pack.manifest.head)
      for (const ref of pack.manifest.refs) {
        expect(await repo.refOid(ref.name), `${name} ${ref.name}`).toBe(ref.oid)
      }
      const log = await revList(repo, [pack.manifest.head!], [])
      expect(log.length, `${name} has history`).toBeGreaterThan(0)
    }
  })

  it('ledgerly-main: clean working tree, full history, release tags and branches', async () => {
    const { repo } = await load('ledgerly-main')
    expect((await computeStatus(repo)).clean, 'main is clean').toBe(true)
    expect(await repo.currentBranch()).toBe('main')
    const log = await revList(repo, [(await repo.headOid())!], [])
    expect(log.length, 'realistic history').toBeGreaterThan(120)
    expect(await repo.listTags()).toEqual(expect.arrayContaining(['v0.1.0', 'v1.0.0', 'v1.2.0', 'v1.4.0', 'v1.4.2']))
    expect(await repo.listBranches()).toEqual(expect.arrayContaining(['main', 'release/1.0', 'release/1.4']))
    // The runnable codebase is present at HEAD.
    expect(await repo.refOid('refs/heads/main')).toBeTruthy()
  })

  it('t1-first-day: a clean early repo, shared only, no api yet', async () => {
    const { fs, repo } = await load('t1-first-day')
    expect(await repo.listBranches()).toEqual(['main'])
    const { exists } = await import('@/engine/fs')
    expect(await exists(fs, `${DIR}/packages/shared/src/money.ts`)).toBe(true)
    expect(await exists(fs, `${DIR}/api/src/invoice.ts`)).toBe(false)
  })

  it('t2-merge-conflict: two branches edited the same README line, unmerged', async () => {
    const { repo } = await load('t2-merge-conflict')
    const branches = await repo.listBranches()
    expect(branches).toEqual(expect.arrayContaining(['main', 'feature/tagline']))
    const mainReadme = await readFileAtCommit(repo, (await repo.refOid('refs/heads/main'))!, 'README.md')
    const featReadme = await readFileAtCommit(repo, (await repo.refOid('refs/heads/feature/tagline'))!, 'README.md')
    expect(mainReadme).not.toBe(featReadme) // divergent → merging will conflict
    expect(mainReadme ?? '').toMatch(/chasing/)
    expect(featReadme ?? '').toMatch(/Get paid faster/)
  })

  it('t4-rebase: HEAD on a messy feature branch with wip commits', async () => {
    const { repo } = await load('t4-rebase')
    expect(await repo.currentBranch()).toBe('feature/csv-export')
    const head = (await repo.headOid())!
    const log = await revList(repo, [head], [(await repo.refOid('refs/heads/main'))!])
    const messages = log.map((c) => c.message.split('\n')[0] ?? '')
    expect(messages.filter((m) => /^wip|oops|more|address review/i.test(m)).length).toBeGreaterThanOrEqual(3)
  })

  it('t5-bisect: a known-good tag and a regression present at HEAD', async () => {
    const { repo } = await load('t5-bisect')
    expect(await repo.listTags()).toContain('v1.2.0-good')
    const head = (await repo.headOid())!
    const money = (await readFileAtCommit(repo, head, 'packages/shared/src/money.ts')) ?? ''
    expect(money, 'regression: percentOf floors instead of rounds').toMatch(/Math\.floor\(\(m\.amount \* percent\)/)
    // the known-good version does NOT have the regression
    const good = (await readFileAtCommit(repo, (await repo.refOid('refs/tags/v1.2.0-good'))!, 'packages/shared/src/money.ts')) ?? ''
    expect(good).toMatch(/Math\.round\(\(m\.amount \* percent\)/)
  })

  it('t6-secret: a fake key lives in history but not at HEAD', async () => {
    const { repo } = await load('t6-secret')
    const head = (await repo.headOid())!
    const headConfig = await readFileAtCommit(repo, head, 'api/src/config.ts')
    expect(headConfig).not.toMatch(/sk_live_FAKE/)
    // walk history: some ancestor committed the key
    const log = await revList(repo, [head], [])
    let found = false
    for (const c of log) {
      const cfg = await readFileAtCommit(repo, c.oid, 'api/src/config.ts')
      if (cfg && /sk_live_FAKE/.test(cfg)) {
        found = true
        break
      }
    }
    expect(found, 'leaked key is still in git history').toBe(true)
  })
})

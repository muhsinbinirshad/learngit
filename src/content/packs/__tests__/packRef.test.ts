import { describe, it, expect } from 'vitest'
import { createMemoryFs } from '@/engine/fs/memory'
import { seedLab } from '@/engine/scenario/seed'
import { Repo } from '@/engine/git/repo'
import { readFileAtCommit } from '@/engine/git/tree'
import { revList } from '@/engine/git/history'
import { resolveLabForSeed } from '@/content'
import type { LabDefinition } from '@/engine/scenario/types'

const HOME = '/home/learner'

/** A minimal lab that seeds from a named Ledgerly pack. */
function packLab(packRef: string): LabDefinition {
  return { id: `fixture-${packRef}`, workspace: { projectDir: 'ledgerly' }, seed: { packRef } } as unknown as LabDefinition
}

async function seedFromPack(packRef: string) {
  const fs = createMemoryFs()
  const resolved = await resolveLabForSeed(packLab(packRef))
  expect(resolved.seed.pack, `${packRef} resolved to an inline pack`).toBeTruthy()
  const seeded = await seedLab(fs, resolved, HOME)
  return { fs, repo: new Repo(fs, seeded.repoDir) }
}

describe('seed.packRef loads Ledgerly planted packs with the correct graph', () => {
  it('rejects an unknown packRef', async () => {
    await expect(resolveLabForSeed(packLab('does-not-exist'))).rejects.toThrow(/unknown seed packRef/)
  })

  it('bisect regression pack: Math.floor at HEAD, with a known-good tag earlier', async () => {
    const { repo } = await seedFromPack('t5-bisect')
    const head = (await repo.headOid())!
    const money = (await readFileAtCommit(repo, head, 'packages/shared/src/money.ts')) ?? ''
    expect(money).toMatch(/Math\.floor\(\(m\.amount \* percent\)/)
    expect(await repo.listTags()).toContain('v1.2.0-good')
    const good = (await readFileAtCommit(repo, (await repo.refOid('refs/tags/v1.2.0-good'))!, 'packages/shared/src/money.ts')) ?? ''
    expect(good).toMatch(/Math\.round\(\(m\.amount \* percent\)/)
  })

  it('leaked-key pack: fake key in history, absent at HEAD', async () => {
    const { repo } = await seedFromPack('t6-secret')
    const head = (await repo.headOid())!
    expect((await readFileAtCommit(repo, head, 'api/src/config.ts')) ?? '').not.toMatch(/sk_live_FAKE/)
    const log = await revList(repo, [head], [])
    let found = false
    for (const c of log) {
      const cfg = await readFileAtCommit(repo, c.oid, 'api/src/config.ts')
      if (cfg && /sk_live_FAKE/.test(cfg)) found = true
    }
    expect(found, 'fake key still in history').toBe(true)
  })

  it('messy-branch pack: feature/csv-export checked out with wip commits', async () => {
    const { repo } = await seedFromPack('t4-rebase')
    expect(await repo.currentBranch()).toBe('feature/csv-export')
    const head = (await repo.headOid())!
    const log = await revList(repo, [head], [(await repo.refOid('refs/heads/main'))!])
    const subjects = log.map((c) => c.message.split('\n')[0] ?? '')
    expect(subjects.filter((m) => /^wip|oops|more|address review/i.test(m)).length).toBeGreaterThanOrEqual(3)
  })
})

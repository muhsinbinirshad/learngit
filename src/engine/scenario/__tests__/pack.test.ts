import { describe, it, expect } from 'vitest'
import { createMemoryFs } from '../../fs/memory'
import { readText } from '../../fs'
import { Repo } from '../../git/repo'
import { Shell } from '../../shell/shell'
import { stripAnsi } from '../../shell/format'
import { seedLab } from '../seed'
import { exportSeedPack, loadSeedPack } from '../pack'
import type { LabDefinition } from '../types'

const HOME = '/home/learner'

/** A small lab that builds real history: two branches, a merge, a tag, plus uncommitted work. */
const sourceLab = {
  id: 'pack-fixture',
  workspace: { projectDir: 'ledgerly', identity: { name: 'Ada Reyes', email: 'ada@ledgerly.test' } },
  cast: { kofi: { name: 'Kofi Mensah', email: 'kofi@ledgerly.test' } },
  seed: {
    startDate: '2026-01-05T09:00:00Z',
    stepMinutes: 60,
    steps: [
      { type: 'commit', message: 'chore: scaffold invoicing api', files: { 'README.md': '# Ledgerly\n', 'api/index.ts': 'export const v = 1\n' }, label: 'root' },
      { type: 'commit', message: 'feat: add totals helper', author: 'kofi', files: { 'api/totals.ts': 'export const sum = (a: number, b: number) => a + b\n' } },
      { type: 'branch', name: 'release/1.0', from: 'HEAD' },
      { type: 'tag', name: 'v1.0.0', ref: 'HEAD', message: 'release 1.0.0' },
      { type: 'commit', message: 'feat: draft csv export', files: { 'api/export.ts': 'export const csv = () => ""\n' }, label: 'tip' },
      // leave uncommitted work so the pack must preserve working tree + index state faithfully
      { type: 'file', path: 'api/export.ts', content: 'export const csv = () => "id,total"\n' },
    ],
  },
} as unknown as LabDefinition

async function statusText(fs: ReturnType<typeof createMemoryFs>, cwd: string): Promise<string> {
  const shell = new Shell({ fs, home: HOME, cwd, io: { openEditor: async (r) => r.content }, clock: { now: () => 1 } })
  const r = await shell.run('git status')
  return r.output.map(stripAnsi).join('\n')
}

describe('seed packs', () => {
  it('round-trips a repository byte-for-byte (oids, refs, tags, working tree)', async () => {
    const src = createMemoryFs()
    const seeded = await seedLab(src, sourceLab, HOME)
    const srcRepo = new Repo(src, seeded.repoDir)
    const srcHead = await srcRepo.headOid()
    const srcRefs = await srcRepo.listAllRefs()
    const srcStatus = await statusText(src, seeded.repoDir)

    const pack = await exportSeedPack(src, seeded.repoDir, { labels: seeded.labels })
    expect(pack.version).toBe(1)
    expect(pack.manifest.head).toBe(srcHead)
    expect(pack.manifest.branch).toBe('main')
    expect(pack.manifest.labels).toEqual(seeded.labels)
    // `.git` internals and working-tree files both travel in the pack.
    expect(Object.keys(pack.files)).toContain('.git/HEAD')
    expect(Object.keys(pack.files)).toContain('api/export.ts')

    // Load into a pristine filesystem at a different path.
    const dst = createMemoryFs()
    const dstDir = `${HOME}/restored`
    await loadSeedPack(dst, dstDir, pack)
    const dstRepo = new Repo(dst, dstDir)

    expect(await dstRepo.headOid()).toBe(srcHead)
    expect((await dstRepo.listAllRefs()).map((r) => `${r.name}@${r.oid}`).sort()).toEqual(srcRefs.map((r) => `${r.name}@${r.oid}`).sort())
    expect(await dstRepo.listTags()).toContain('v1.0.0')
    expect(await dstRepo.branchExists('release/1.0')).toBe(true)
    // Working tree preserved, including the uncommitted edit.
    expect(await readText(dst, `${dstDir}/api/export.ts`)).toBe('export const csv = () => "id,total"\n')
    // Status (staging + working tree) is identical to the source.
    expect(await statusText(dst, dstDir)).toBe(srcStatus)
  })

  it('re-exporting a loaded pack is deterministic', async () => {
    const src = createMemoryFs()
    const seeded = await seedLab(src, sourceLab, HOME)
    const pack = await exportSeedPack(src, seeded.repoDir)

    const dst = createMemoryFs()
    const dstDir = `${HOME}/restored`
    await loadSeedPack(dst, dstDir, pack)
    const pack2 = await exportSeedPack(dst, dstDir)
    expect(pack2.files).toEqual(pack.files)
    expect(pack2.manifest.head).toBe(pack.manifest.head)
  })

  it('reloading a pack is idempotent (backs Reset lab)', async () => {
    const src = createMemoryFs()
    const seeded = await seedLab(src, sourceLab, HOME)
    const pack = await exportSeedPack(src, seeded.repoDir)

    const dst = createMemoryFs()
    const dstDir = `${HOME}/restored`
    await loadSeedPack(dst, dstDir, pack)
    const repo = new Repo(dst, dstDir)
    const head1 = await repo.headOid()
    // Mutate, then reload: state must come back exactly.
    await dst.promises.writeFile(`${dstDir}/api/export.ts`, new TextEncoder().encode('garbage'))
    await loadSeedPack(dst, dstDir, pack)
    expect(await new Repo(dst, dstDir).headOid()).toBe(head1)
    expect(await readText(dst, `${dstDir}/api/export.ts`)).toBe('export const csv = () => "id,total"\n')
  })

  it('seedLab loads a pack, then runs steps on top', async () => {
    const src = createMemoryFs()
    const seeded = await seedLab(src, sourceLab, HOME)
    const pack = await exportSeedPack(src, seeded.repoDir, { labels: { tip: seeded.labels.tip! } })
    const baseHead = pack.manifest.head

    // A lab that starts from the snapshot and adds one commit on top.
    const packLab = {
      id: 'pack-plus-steps',
      workspace: { projectDir: 'ledgerly', identity: { name: 'Ada Reyes', email: 'ada@ledgerly.test' } },
      seed: {
        pack,
        steps: [{ type: 'commit', message: 'fix: finish csv export', files: { 'api/export.ts': 'export const csv = () => "id,total,paid"\n' } }],
      },
    } as unknown as LabDefinition

    const fs = createMemoryFs()
    const result = await seedLab(fs, packLab, HOME)
    const repo = new Repo(fs, result.repoDir)
    const head = await repo.headOid()
    expect(head).not.toBe(baseHead)
    // The new commit's parent is the snapshot's HEAD: history continues from the pack.
    expect((await repo.readCommit(head!)).commit.parent[0]).toBe(baseHead)
    // Labels from the pack manifest survive into the seeded repo.
    expect(result.labels.tip).toBe(seeded.labels.tip)
    expect(await readText(fs, `${result.repoDir}/api/export.ts`)).toBe('export const csv = () => "id,total,paid"\n')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The generator is a plain Node + isomorphic-git script (no type declarations); import it typed.
type BuildResult = { dir: string; head: string; labels: Record<string, string>; commitCount: number }
type BuildFn = (opts?: { repoDir?: string; writePacks?: boolean }) => Promise<BuildResult>

async function loadBuild(): Promise<BuildFn> {
  const mod = (await import('../../../../scripts/ledgerly/build.mjs')) as unknown as { build: BuildFn }
  return mod.build
}

const LEDGERLY = join(process.cwd(), 'ledgerly')

describe('Ledgerly history generator', () => {
  it('is deterministic: two builds produce identical hashes', async () => {
    const build = await loadBuild()
    const a = await build({ writePacks: false })
    const b = await build({ writePacks: false })
    expect(a.head).toBe(b.head)
    expect(a.commitCount).toBe(b.commitCount)
    expect(JSON.stringify(a.labels)).toBe(JSON.stringify(b.labels))
    expect(a.commitCount).toBeGreaterThan(120)
  }, 60_000)

  it('HEAD matches the runnable ledgerly/ source', async () => {
    const build = await loadBuild()
    const { dir } = await build({ writePacks: false })
    for (const rel of ['packages/shared/src/money.ts', 'api/src/invoice.ts', 'package.json']) {
      expect(readFileSync(join(dir, rel), 'utf8'), rel).toBe(readFileSync(join(LEDGERLY, rel), 'utf8'))
    }
  }, 60_000)
})

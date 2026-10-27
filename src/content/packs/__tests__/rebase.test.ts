import { describe, it, expect } from 'vitest'
import { createMemoryFs } from '@/engine/fs/memory'
import { seedLab } from '@/engine/scenario/seed'
import { Repo } from '@/engine/git/repo'
import { applyRebaseTodo } from '@/engine/git/integrate'
import { revList } from '@/engine/git/history'
import { evaluateObjectives } from '@/engine/validator'
import { resolveLabForSeed, labsById } from '@/content'

const HOME = '/home/learner'

/**
 * The interactive-rebase lab is validated by its resulting repository state, not by driving an
 * editor. We seed the planted messy branch, apply a squash todo via applyRebaseTodo (what the UI
 * editor calls), and assert the lab's own objectives are met.
 */
describe('t4-rebase-clean: interactive rebase squashes the messy branch', () => {
  it('squashes five wip commits into one, preserving the export code, and meets the objectives', async () => {
    const fs = createMemoryFs()
    const lab = await resolveLabForSeed(labsById['t4-rebase-clean']!)
    const seeded = await seedLab(fs, lab, HOME)
    const repo = new Repo(fs, seeded.repoDir)

    // Starts on the messy branch with five commits not on main.
    expect(await repo.currentBranch()).toBe('feature/csv-export')
    const head = (await repo.headOid())!
    const before = await revList(repo, [head], [(await repo.refOid('refs/heads/main'))!])
    expect(before.length).toBe(5)

    // Squash: pick the oldest, fold the other four in. (upstream = the branch point, HEAD~5.)
    const outcome = await applyRebaseTodo(repo, {
      upstream: 'HEAD~5',
      todo: [
        { action: 'pick', ref: 'HEAD~4' },
        { action: 'squash', ref: 'HEAD~3' },
        { action: 'squash', ref: 'HEAD~2' },
        { action: 'squash', ref: 'HEAD~1' },
        { action: 'squash', ref: 'HEAD' },
      ],
      message: async () => 'feat(api): add CSV export',
    })
    expect(outcome.status).not.toBe('conflict')

    const after = await revList(repo, [(await repo.headOid())!], [(await repo.refOid('refs/heads/main'))!])
    expect(after.length, 'one commit above the branch point').toBe(1)

    const results = await evaluateObjectives(lab.objectives, { fs, repoDir: seeded.repoDir, labels: seeded.labels })
    expect(results.filter((r) => !r.met).map((r) => r.id), 'all objectives met after the rebase').toEqual([])
  })
})

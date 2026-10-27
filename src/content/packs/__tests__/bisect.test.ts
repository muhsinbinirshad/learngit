import { describe, it, expect } from 'vitest'
import { createMemoryFs } from '@/engine/fs/memory'
import { readTextOrNull, writeFileDeep } from '@/engine/fs'
import { seedLab } from '@/engine/scenario/seed'
import { Repo } from '@/engine/git/repo'
import { bisectStart, bisectMark } from '@/engine/git/bisect'
import { evaluateObjectives, interpolate } from '@/engine/validator'
import { labsById } from '@/content'
import type { LabDefinition } from '@/engine/scenario/types'

const HOME = '/home/learner'

/**
 * The bisect lab is validated by resulting state: we drive git bisect the way a learner would —
 * marking each checked-out commit good/bad by whether tax.js still rounds — find the first bad
 * commit, record it in ANSWERS.md, and assert the lab's objectives are met and the commit found is
 * the planted regression.
 */
describe('t5-bisect: bisect locates the planted regression', () => {
  it('finds the commit that dropped Math.round and the recorded answer satisfies the lab', async () => {
    const fs = createMemoryFs()
    const lab = labsById['t5-bisect'] as LabDefinition
    const seeded = await seedLab(fs, lab, HOME)
    const repo = new Repo(fs, seeded.repoDir)

    const taxRoundsNow = async () => /Math\.round/.test((await readTextOrNull(fs, `${seeded.repoDir}/src/tax.js`)) ?? '')

    let lines = await bisectStart(repo, 'HEAD', ['HEAD~6'])
    let firstBad: string | null = null
    for (let i = 0; i < 12 && !firstBad; i++) {
      const done = lines.find((l) => /is the first bad commit$/.test(l))
      if (done) {
        firstBad = done.split(' ')[0]!
        break
      }
      // Git has checked out the midpoint; test it and mark.
      lines = await bisectMark(repo, (await taxRoundsNow()) ? 'good' : 'bad')
    }

    expect(firstBad, 'bisect converged on a first bad commit').toBeTruthy()
    expect(firstBad).toBe(seeded.labels.regression) // the planted "refactor: simplify tax calc"

    // Record the answer the way the lab asks, then check the lab's objectives pass.
    const shortBad = interpolate('{{label:regression:short}}', seeded.labels)
    await writeFileDeep(fs, `${seeded.repoDir}/ANSWERS.md`, `Bad commit: ${shortBad} — dropped Math.round from tax()\n`)

    const results = await evaluateObjectives(lab.objectives, { fs, repoDir: seeded.repoDir, labels: seeded.labels })
    expect(results.filter((r) => !r.met).map((r) => r.id), 'all objectives met').toEqual([])
  })
})

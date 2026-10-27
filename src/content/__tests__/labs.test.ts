import { describe, it, expect } from 'vitest'
import { createMemoryFs } from '@/engine/fs/memory'
import { Shell } from '@/engine/shell/shell'
import { stripAnsi } from '@/engine/shell/format'
import { seedLab } from '@/engine/scenario/seed'
import { validateLabDefinition } from '@/engine/scenario/validate'
import { applyStickiness, evaluateObjectives, interpolate } from '@/engine/validator'
import { labs, lessons, tracks, labsById, lessonsById, allItems, itemsForTrack, trackUnlock, itemUnlock, completedIds, trackModes } from '..'
import schema from '../lab.schema.json'

const HOME = '/home/learner'

describe('lab content', () => {
  it('every lab passes structural validation and belongs to a track', () => {
    for (const lab of labs) {
      expect(validateLabDefinition(lab), lab.id).toEqual([])
      const track = tracks.find((t) => t.id === lab.track)
      expect(track, `${lab.id} track`).toBeDefined()
      expect(
        track!.items.map((i) => i.id),
        `${lab.id} listed in track`,
      ).toContain(lab.id)
    }
    for (const t of tracks) for (const i of t.items) expect(i.type === 'lab' ? labsById[i.id] : lessonsById[i.id], `${i.id} exists`).toBeDefined()
    expect(schema.required).toContain('objectives')
  })

  it('every lesson has sections, takeaways and a valid quiz', () => {
    for (const l of lessons) {
      expect(l.sections.length, l.id).toBeGreaterThan(0)
      expect(l.takeaways.length, l.id).toBeGreaterThan(0)
      expect(l.quiz.length, l.id).toBeGreaterThanOrEqual(2)
      for (const q of l.quiz) {
        expect(q.options.length).toBeGreaterThanOrEqual(2)
        expect(q.answer).toBeGreaterThanOrEqual(0)
        expect(q.answer).toBeLessThan(q.options.length)
        expect(q.explanation.length).toBeGreaterThan(10)
      }
      expect(/lorem ipsum/i.test(JSON.stringify(l))).toBe(false)
    }
    const ids = allItems.map((i) => i.id)
    expect(new Set(ids).size, 'item ids unique across tracks').toBe(ids.length)
  })

  it('unlocks tracks and steps strictly in order', () => {
    const none = completedIds({ labs: {}, lessons: {} })
    const first = allItems[0]!
    expect(itemUnlock(first.id, none).unlocked).toBe(true)
    expect(itemUnlock(allItems[1]!.id, none).unlocked).toBe(false)
    expect(trackUnlock(tracks[1]!.id, none).unlocked).toBe(false)
    // Complete the whole first track: its last item opens the second track's first step.
    const firstTrack = itemsForTrack(tracks[0]!.id)
    const done = new Set(firstTrack.map((i) => i.id))
    expect(trackUnlock(tracks[1]!.id, done).unlocked).toBe(true)
    expect(itemUnlock(itemsForTrack(tracks[1]!.id)[0]!.id, done).unlocked).toBe(true)
    expect(itemUnlock(itemsForTrack(tracks[1]!.id)[1]!.id, done).unlocked).toBe(false)
    // Finishing a step unlocks exactly the next one.
    const plusOne = new Set([...done, itemsForTrack(tracks[1]!.id)[0]!.id])
    expect(itemUnlock(itemsForTrack(tracks[1]!.id)[1]!.id, plusOne).unlocked).toBe(true)
    expect(itemUnlock(itemsForTrack(tracks[1]!.id)[2]!.id, plusOne).unlocked).toBe(false)
  })

  it('uses only check types declared in the JSON schema', () => {
    const allowed = new Set(schema.$defs.check.properties.type.enum as string[])
    const walk = (c: { type: string; check?: unknown; checks?: unknown[] }) => {
      expect(allowed.has(c.type), c.type).toBe(true)
      if (c.check) walk(c.check as never)
      for (const x of c.checks ?? []) walk(x as never)
    }
    for (const lab of labs) for (const o of lab.objectives) walk(o.check)
  })

  it('track modes are reported for badges: Foundations is sandbox, Track 3 is Real GitHub', () => {
    expect(trackModes('foundations')).toEqual(['sandbox'])
    expect(trackModes('remotes-collaboration')).toEqual(['github'])
  })

  it('github (Real-mode) labs carry a realMode block and belong to a track', () => {
    const githubLabs = labs.filter((l) => l.mode === 'github')
    expect(githubLabs.length, 'has at least one Real-mode lab').toBeGreaterThan(0)
    for (const lab of githubLabs) {
      expect(lab.realMode?.setup.length, `${lab.id} setup`).toBeGreaterThan(0)
      expect(lab.realMode?.commands.length, `${lab.id} commands`).toBeGreaterThan(0)
      expect(lab.objectives.length, `${lab.id} objectives`).toBeGreaterThan(0)
    }
  })

  // These labs are validated by resulting repository state in dedicated tests (interactive rebase via
  // applyRebaseTodo in rebase.test.ts; bisect driven programmatically in bisect.test.ts) rather than by
  // replaying a solution through the editor/prompt-driven shell.
  const STATE_VALIDATED_LABS = new Set(['t4-rebase-clean', 't5-bisect'])

  // Only sandbox labs validated by solution-replay run here; Real-mode labs validate against GitHub
  // (src/server tests) and the state-validated labs have their own tests.
  for (const lab of labs.filter((l) => (l.mode ?? 'sandbox') === 'sandbox' && !STATE_VALIDATED_LABS.has(l.id))) {
    it(`${lab.id}: seeds, starts incomplete, and is completable with the reference solution`, async () => {
      const fs = createMemoryFs()
      const seeded = await seedLab(fs, lab, HOME)
      const ctx = { fs, repoDir: seeded.repoDir, labels: seeded.labels }

      const before = await evaluateObjectives(lab.objectives, ctx)
      const metAtStart = before.filter((r) => r.met).map((r) => r.id)
      expect(metAtStart, `objectives met before doing anything in ${lab.id}`).toEqual([])

      let t = 1_800_000_000
      const shell = new Shell({ fs, home: HOME, cwd: seeded.cwd, io: { openEditor: async (r) => r.content }, clock: { now: () => (t += 45) } })
      const transcript: string[] = []
      // Objectives are re-evaluated after every command and sticky ones stay met, exactly as in the workspace.
      let progress: Record<string, boolean> = {}
      for (const raw of lab.solution) {
        const line = interpolate(raw, seeded.labels)
        const r = await shell.run(line)
        transcript.push(`$ ${line}`, ...r.output.map(stripAnsi))
        if (r.exitCode !== 0 && !/^git (merge|diff|log|show|blame|status)/.test(line)) {
          throw new Error(`solution step failed (${r.exitCode}): ${line}\n${transcript.join('\n')}`)
        }
        if (!r.prompt) progress = applyStickiness(lab.objectives, progress, await evaluateObjectives(lab.objectives, ctx))
      }
      const final = await evaluateObjectives(lab.objectives, ctx)
      const unmet = lab.objectives.filter((o) => !progress[o.id])
      expect(
        unmet.map((o) => o.id),
        `unmet after solution in ${lab.id}:\n${unmet.map((u) => `${u.id}: ${final.find((f) => f.id === u.id)?.reason}`).join('\n')}\n--- transcript ---\n${transcript.join('\n')}`,
      ).toEqual([])
    })
  }
})

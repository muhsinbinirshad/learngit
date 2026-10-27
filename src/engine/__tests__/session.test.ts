import { describe, it, expect } from 'vitest'
import { createMemoryFs } from '../fs/memory'
import { mkdirp, readText } from '../fs'
import { Repo } from '../git/repo'
import { Shell } from '../shell/shell'
import { stripAnsi } from '../shell/format'

const HOME = '/home/learner'

/**
 * The Phase 2 acceptance scenario, driven entirely through the terminal:
 * init → branch → conflicting merge → resolve → reset → reflog recovery.
 */
describe('full terminal session', () => {
  it('init, branch, conflicting merge, resolve, reset, then recover via reflog', async () => {
    const fs = createMemoryFs()
    await mkdirp(fs, HOME)
    let t = 1_700_000_000
    const shell = new Shell({ fs, home: HOME, cwd: HOME, io: { openEditor: async (r) => r.content }, clock: { now: () => (t += 60) } })

    const run = async (cmd: string) => {
      const r = await shell.run(cmd)
      return { code: r.exitCode, text: r.output.map(stripAnsi).join('\n') }
    }
    const expectOk = async (cmd: string) => {
      const r = await run(cmd)
      expect(r.code, `${cmd}\n${r.text}`).toBe(0)
      return r
    }

    // --- init ---
    await expectOk('mkdir demo')
    await expectOk('cd demo')
    await expectOk('git init')
    await expectOk('git config user.name "Dev One"')
    await expectOk('git config user.email dev@ledgerly.test')
    const repo = new Repo(fs, `${HOME}/demo`)
    expect(await repo.exists()).toBe(true)

    await expectOk('echo "total = 1" > billing.txt')
    await expectOk('git add billing.txt')
    await expectOk('git commit -m "base: billing baseline"')
    const base = await repo.headOid()
    expect(base).toBeTruthy()

    // --- branch (diverging edits to the same line) ---
    await expectOk('git switch -c feature')
    await expectOk('echo "total = 2 (feature)" > billing.txt')
    await expectOk('git add billing.txt')
    await expectOk('git commit -m "feature: bump total"')

    await expectOk('git switch main')
    await expectOk('echo "total = 3 (main)" > billing.txt')
    await expectOk('git add billing.txt')
    await expectOk('git commit -m "main: bump total"')

    // --- conflicting merge ---
    const merge = await run('git merge feature')
    expect(merge.code, `merge should conflict:\n${merge.text}`).not.toBe(0)
    const conflicted = await readText(fs, `${HOME}/demo/billing.txt`)
    expect(conflicted).toContain('<<<<<<<')
    expect(conflicted).toContain('=======')
    expect(conflicted).toContain('>>>>>>>')
    expect((await repo.state()).mergeHead, 'merge in progress').toBeTruthy()

    // --- resolve ---
    await expectOk('echo "total = 5 (merged)" > billing.txt')
    await expectOk('git add billing.txt')
    await expectOk('git commit -m "merge: reconcile totals"')
    const mergeCommit = await repo.headOid()
    expect((await repo.state()).mergeHead, 'merge finished').toBeFalsy()
    // A real merge commit: two parents, main's tip and feature's tip.
    const parents = (await repo.readCommit(mergeCommit!)).commit.parent
    expect(parents).toHaveLength(2)
    const log = await run('git log --oneline')
    expect(log.text.split('\n').filter(Boolean)).toHaveLength(4)

    // --- reset (throw the merge away) ---
    await expectOk('git reset --hard HEAD~1')
    expect(await repo.headOid()).not.toBe(mergeCommit)
    // HEAD~1 is the merge's first parent (main's tip); feature's commit was only reachable
    // through the merge, so HEAD now reaches just base + main-edit.
    const afterReset = await run('git log --oneline')
    expect(afterReset.text.split('\n').filter(Boolean)).toHaveLength(2)

    // --- reflog recovery ---
    const reflog = await run('git reflog')
    expect(reflog.text).toContain(mergeCommit!.slice(0, 7))
    await expectOk('git reset --hard HEAD@{1}')
    expect(await repo.headOid(), 'merge commit recovered via reflog').toBe(mergeCommit)
    expect(await readText(fs, `${HOME}/demo/billing.txt`)).toContain('merged')
  })
})

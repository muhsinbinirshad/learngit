import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryFs } from '../../fs/memory'
import { mkdirp, writeFileDeep, readText, exists } from '../../fs'
import { Repo, type Clock } from '../repo'
import { setGlobalConfig } from '../identity'
import { createCommit } from '../commit'
import { stagePath, computeStatus } from '../worktree'
import { switchTo, restorePaths } from '../checkout'
import { mergeRef, cherryPick, revertCommits, rebase, concludeMerge, abortMerge } from '../integrate'
import { resetTo } from '../reset'
import { stashPush, stashApply, stashList } from '../stash'
import { revList, blame } from '../history'
import { diffWorktree, diffStaged } from '../diff'
import { initBareRemote, pushBranch, fetchRemote, cloneRepo } from '../remote'
import { bisectStart, bisectMark } from '../bisect'
import { buildGraphModel } from '../graph'
import { readFlatTree } from '../tree'

function makeClock(): Clock {
  let t = 1_700_000_000
  return { now: () => (t += 60) }
}

async function setup() {
  const fs = createMemoryFs()
  await mkdirp(fs, '/work/project')
  await setGlobalConfig(fs, 'user.name', 'Test User')
  await setGlobalConfig(fs, 'user.email', 'test@example.com')
  const repo = new Repo(fs, '/work/project', makeClock())
  await repo.init('main')
  return { fs, repo }
}

async function write(repo: Repo, path: string, content: string) {
  await writeFileDeep(repo.fs, `${repo.dir}/${path}`, content)
}
async function commitAll(repo: Repo, message: string, files: Record<string, string>) {
  for (const [p, c] of Object.entries(files)) {
    await write(repo, p, c)
    await stagePath(repo, p)
  }
  return createCommit(repo, { message })
}

describe('git core', () => {
  let fs: ReturnType<typeof createMemoryFs>
  let repo: Repo
  beforeEach(async () => {
    const s = await setup()
    fs = s.fs
    repo = s.repo
  })

  it('creates commits and reports status transitions', async () => {
    await write(repo, 'README.md', '# Hello\n')
    let st = await computeStatus(repo)
    expect(st.untracked.map((e) => e.path)).toEqual(['README.md'])
    await stagePath(repo, 'README.md')
    st = await computeStatus(repo)
    expect(st.staged[0]).toMatchObject({ path: 'README.md', staged: 'added' })
    const c = await createCommit(repo, { message: 'Initial commit' })
    expect(c.isInitial).toBe(true)
    expect(await repo.headOid()).toBe(c.oid)
    st = await computeStatus(repo)
    expect(st.clean).toBe(true)

    await write(repo, 'README.md', '# Hello\nMore\n')
    st = await computeStatus(repo)
    expect(st.unstaged[0]).toMatchObject({ path: 'README.md', unstaged: 'modified' })
    await stagePath(repo, 'README.md')
    await write(repo, 'README.md', '# Hello\nMore\nEven more\n')
    st = await computeStatus(repo)
    expect(st.staged[0]).toMatchObject({ staged: 'modified' })
    expect(st.unstaged[0]).toMatchObject({ unstaged: 'modified' })
  })

  it('refuses to commit without identity', async () => {
    await setGlobalConfig(fs, 'user.name', null)
    await write(repo, 'a.txt', 'a')
    await stagePath(repo, 'a.txt')
    await expect(createCommit(repo, { message: 'x' })).rejects.toThrow(/Please tell me who you are/)
  })

  it('fast-forwards and three-way merges, including conflicts', async () => {
    await commitAll(repo, 'base', { 'app.js': 'line1\nline2\nline3\n' })
    await switchTo(repo, 'feature', { create: 'feature' })
    await commitAll(repo, 'feature work', { 'feature.js': 'f\n' })
    await switchTo(repo, 'main')
    const ff = await mergeRef(repo, 'feature')
    expect(ff.status).toBe('fast-forward')
    expect(await exists(fs, '/work/project/feature.js')).toBe(true)

    // Divergent, non-conflicting
    await switchTo(repo, 'topic', { create: 'topic' })
    await commitAll(repo, 'topic', { 'topic.js': 't\n' })
    await switchTo(repo, 'main')
    await commitAll(repo, 'main work', { 'main.js': 'm\n' })
    const m = await mergeRef(repo, 'topic')
    expect(m.status).toBe('ok')
    const head = await repo.readCommit((await repo.headOid())!)
    expect(head.commit.parent).toHaveLength(2)
    expect(head.commit.message).toMatch(/Merge branch 'topic'/)

    // Conflict
    await switchTo(repo, 'conflict', { create: 'conflict' })
    await commitAll(repo, 'change line2 on branch', { 'app.js': 'line1\nBRANCH\nline3\n' })
    await switchTo(repo, 'main')
    await commitAll(repo, 'change line2 on main', { 'app.js': 'line1\nMAIN\nline3\n' })
    const conflict = await mergeRef(repo, 'conflict')
    expect(conflict.status).toBe('conflict')
    expect(conflict.lines.join('\n')).toMatch(/CONFLICT \(content\): Merge conflict in app.js/)
    const text = await readText(fs, '/work/project/app.js')
    expect(text).toContain('<<<<<<< HEAD')
    expect(text).toContain('>>>>>>> conflict')
    const st = await computeStatus(repo)
    expect(st.conflicted.map((e) => e.path)).toEqual(['app.js'])
    await expect(createCommit(repo, { message: 'x' })).rejects.toThrow(/unmerged files/)
    await write(repo, 'app.js', 'line1\nRESOLVED\nline3\n')
    await stagePath(repo, 'app.js')
    await repo.clearConflict('app.js')
    const done = await concludeMerge(repo)
    expect(done.oid).toBe(await repo.headOid())
    expect(await repo.getMergeHead()).toBeNull()
  })

  it('aborts a conflicted merge', async () => {
    await commitAll(repo, 'base', { 'a.txt': '1\n' })
    await switchTo(repo, 'b', { create: 'b' })
    await commitAll(repo, 'b', { 'a.txt': '2\n' })
    await switchTo(repo, 'main')
    await commitAll(repo, 'm', { 'a.txt': '3\n' })
    const headBefore = await repo.headOid()
    expect((await mergeRef(repo, 'b')).status).toBe('conflict')
    await abortMerge(repo)
    expect(await repo.headOid()).toBe(headBefore)
    expect(await readText(fs, '/work/project/a.txt')).toBe('3\n')
    expect((await computeStatus(repo)).clean).toBe(true)
  })

  it('cherry-picks and reverts', async () => {
    await commitAll(repo, 'base', { 'a.txt': 'a\n' })
    await switchTo(repo, 'fix', { create: 'fix' })
    const fix = await commitAll(repo, 'fix bug', { 'fix.txt': 'fixed\n' })
    await switchTo(repo, 'main')
    const cp = await cherryPick(repo, [fix.oid])
    expect(cp.status).toBe('ok')
    expect(await exists(fs, '/work/project/fix.txt')).toBe(true)
    const head = await repo.readCommit((await repo.headOid())!)
    expect(head.commit.message.trim()).toBe('fix bug')
    const rv = await revertCommits(repo, ['HEAD'])
    expect(rv.status).toBe('ok')
    expect(await exists(fs, '/work/project/fix.txt')).toBe(false)
    const h2 = await repo.readCommit((await repo.headOid())!)
    expect(h2.commit.message).toMatch(/^Revert "fix bug"/)
  })

  it('rebases a branch onto main', async () => {
    await commitAll(repo, 'base', { 'a.txt': 'a\n' })
    await switchTo(repo, 'feature', { create: 'feature' })
    await commitAll(repo, 'f1', { 'f1.txt': '1\n' })
    await commitAll(repo, 'f2', { 'f2.txt': '2\n' })
    await switchTo(repo, 'main')
    await commitAll(repo, 'm1', { 'm1.txt': 'm\n' })
    await switchTo(repo, 'feature')
    const r = await rebase(repo, { upstream: 'main' })
    expect(r.status).toBe('ok')
    const list = await revList(repo, [(await repo.headOid())!])
    expect(list.map((c) => c.message.trim())).toEqual(['f2', 'f1', 'm1', 'base'])
    expect(await repo.currentBranch()).toBe('feature')
    expect(await exists(fs, '/work/project/m1.txt')).toBe(true)
  })

  it('interactive rebase squashes, rewords, drops and reorders', async () => {
    await commitAll(repo, 'base', { 'a.txt': 'a\n' })
    await commitAll(repo, 'wip 1', { 'b.txt': 'b\n' })
    await commitAll(repo, 'wip 2', { 'c.txt': 'c\n' })
    await commitAll(repo, 'typo', { 'd.txt': 'd\n' })
    const r = await rebase(repo, {
      upstream: 'HEAD~3',
      interactive: true,
      editTodo: async (todo) => {
        const picks = todo.split('\n').filter((l) => l.startsWith('pick'))
        const [p1, p2, p3] = picks
        return [`reword ${p3!.split(' ')[1]} typo`, p1, `squash ${p2!.split(' ')[1]} wip 2`].join('\n')
      },
      editMessage: async (initial) => (initial.includes('typo') ? 'Fix typo in docs' : 'Add b and c'),
    })
    expect(r.status).toBe('ok')
    const list = await revList(repo, [(await repo.headOid())!])
    expect(list.map((c) => c.message.trim())).toEqual(['Add b and c', 'Fix typo in docs', 'base'])
    const tree = await readFlatTree(repo, (await repo.headOid())!)
    expect([...tree.keys()].sort()).toEqual(['a.txt', 'b.txt', 'c.txt', 'd.txt'])
  })

  it('resets soft/mixed/hard and recovers via reflog entries', async () => {
    const c1 = await commitAll(repo, 'one', { 'a.txt': '1\n' })
    const c2 = await commitAll(repo, 'two', { 'a.txt': '2\n' })
    await repo.appendReflog('HEAD', c1.oid, c2.oid, 'commit: two')
    await resetTo(repo, 'soft', 'HEAD~1')
    expect(await repo.headOid()).toBe(c1.oid)
    expect((await computeStatus(repo)).staged[0]).toMatchObject({ path: 'a.txt', staged: 'modified' })
    await resetTo(repo, 'mixed', c2.oid)
    expect((await computeStatus(repo)).clean).toBe(true)
    await resetTo(repo, 'mixed', 'HEAD~1')
    expect((await computeStatus(repo)).unstaged[0]).toMatchObject({ path: 'a.txt', unstaged: 'modified' })
    await resetTo(repo, 'hard', c2.oid)
    expect(await readText(fs, '/work/project/a.txt')).toBe('2\n')
    await resetTo(repo, 'hard', 'HEAD~1')
    expect(await readText(fs, '/work/project/a.txt')).toBe('1\n')
    // reflog resolution
    await repo.appendReflog('HEAD', c2.oid, c1.oid, 'reset: moving to HEAD~1')
    expect(await repo.resolveRevision('HEAD@{1}')).toBe(c2.oid)
  })

  it('stashes and restores work', async () => {
    await commitAll(repo, 'base', { 'a.txt': 'a\n' })
    await write(repo, 'a.txt', 'changed\n')
    await write(repo, 'new.txt', 'n\n')
    await stagePath(repo, 'new.txt')
    const out = await stashPush(repo)
    expect(out[0]).toMatch(/Saved working directory/)
    expect(await readText(fs, '/work/project/a.txt')).toBe('a\n')
    expect((await computeStatus(repo)).clean).toBe(true)
    expect(await stashList(repo)).toHaveLength(1)
    await stashApply(repo, undefined, { pop: true })
    expect(await readText(fs, '/work/project/a.txt')).toBe('changed\n')
    expect(await exists(fs, '/work/project/new.txt')).toBe(true)
    expect(await stashList(repo)).toHaveLength(0)
  })

  it('switch refuses to clobber local changes and restore works', async () => {
    await commitAll(repo, 'base', { 'a.txt': 'a\n' })
    await switchTo(repo, 'b', { create: 'b' })
    await commitAll(repo, 'b', { 'a.txt': 'b\n' })
    await switchTo(repo, 'main')
    await write(repo, 'a.txt', 'local\n')
    await expect(switchTo(repo, 'b')).rejects.toThrow(/would be overwritten/)
    await restorePaths(repo, ['a.txt'], {})
    expect(await readText(fs, '/work/project/a.txt')).toBe('a\n')
    await switchTo(repo, 'b')
    expect(await readText(fs, '/work/project/a.txt')).toBe('b\n')
  })

  it('diffs worktree and index', async () => {
    await commitAll(repo, 'base', { 'a.txt': 'one\ntwo\n' })
    await write(repo, 'a.txt', 'one\nthree\n')
    const d = await diffWorktree(repo)
    expect(d).toHaveLength(1)
    expect(d[0]!.insertions).toBe(1)
    expect(d[0]!.deletions).toBe(1)
    expect(await diffStaged(repo)).toHaveLength(0)
    await stagePath(repo, 'a.txt')
    expect(await diffStaged(repo)).toHaveLength(1)
  })

  it('blames lines to the right commits', async () => {
    const c1 = await commitAll(repo, 'first', { 'f.txt': 'alpha\nbeta\n' })
    const c2 = await commitAll(repo, 'second', { 'f.txt': 'alpha\nBETA\ngamma\n' })
    const b = await blame(repo, 'f.txt')
    expect(b.map((l) => l.oid)).toEqual([c1.oid, c2.oid, c2.oid])
  })

  it('pushes, rejects non-fast-forward, fetches and clones', async () => {
    await initBareRemote(fs, '/remotes/team.git')
    const g = (await import('isomorphic-git')).default
    await g.addRemote({ fs, gitdir: repo.gitdir, remote: 'origin', url: '/remotes/team.git' })
    await commitAll(repo, 'base', { 'a.txt': 'a\n' })
    const out = await pushBranch(repo, { remote: 'origin', branch: 'main', setUpstream: true })
    expect(out.join('\n')).toMatch(/new branch/)
    // Clone elsewhere and push a commit from there
    const { repo: other } = await cloneRepo(fs, '/remotes/team.git', '/work/other', makeClock())
    expect(await readText(fs, '/work/other/a.txt')).toBe('a\n')
    await commitAll(other, 'other work', { 'b.txt': 'b\n' })
    await pushBranch(other, {})
    // Local push now rejected
    await commitAll(repo, 'local work', { 'c.txt': 'c\n' })
    await expect(pushBranch(repo, {})).rejects.toThrow(/rejected/)
    const f = await fetchRemote(repo, 'origin')
    expect(f.updated).toHaveLength(1)
    const m = await mergeRef(repo, 'origin/main')
    expect(m.status).toBe('ok')
    const out2 = await pushBranch(repo, {})
    expect(out2.join('\n')).toMatch(/main -> main/)
  })

  it('bisects to the first bad commit', async () => {
    const oids: string[] = []
    for (let i = 1; i <= 8; i++) {
      const c = await commitAll(repo, `commit ${i}`, { 'v.txt': `${i}\n`, 'bug.txt': i >= 5 ? 'bug\n' : 'ok\n' })
      oids.push(c.oid)
    }
    let lines = await bisectStart(repo, 'HEAD', [oids[0]!])
    expect(lines.join('\n')).toMatch(/Bisecting/)
    for (let i = 0; i < 6; i++) {
      const v = await readText(fs, '/work/project/bug.txt')
      lines = await bisectMark(repo, v.includes('bug') ? 'bad' : 'good')
      if (lines[0]!.includes('is the first bad commit')) break
    }
    expect(lines[0]).toBe(`${oids[4]} is the first bad commit`)
  })

  it('builds a graph model with lanes and refs', async () => {
    await commitAll(repo, 'base', { 'a.txt': 'a\n' })
    await switchTo(repo, 'feature', { create: 'feature' })
    await commitAll(repo, 'f', { 'f.txt': 'f\n' })
    await switchTo(repo, 'main')
    await commitAll(repo, 'm', { 'm.txt': 'm\n' })
    const model = await buildGraphModel(repo)
    expect(model.nodes).toHaveLength(3)
    expect(model.laneCount).toBe(2)
    const main = model.nodes.find((n) => n.refs.some((r) => r.name === 'main'))!
    expect(main.isHead).toBe(true)
    expect(model.edges.filter((e) => !e.dangling)).toHaveLength(2)
  })
})

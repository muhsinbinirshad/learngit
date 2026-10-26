import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryFs } from '../../fs/memory'
import { mkdirp, readText } from '../../fs'
import { Shell } from '../shell'
import { tokenize, parse } from '../tokenize'
import { parseArgs } from '../args'
import { stripAnsi } from '../format'
import type { ShellIO } from '../types'

function makeShell(editor?: ShellIO['openEditor']) {
  const fs = createMemoryFs()
  let t = 1_700_000_000
  const io: ShellIO = { openEditor: editor ?? (async (req) => req.content) }
  const shell = new Shell({ fs, home: '/home/learner', io, clock: { now: () => (t += 60) } })
  return { fs, shell }
}

async function run(shell: Shell, ...cmds: string[]) {
  let out: string[] = []
  let code = 0
  for (const c of cmds) {
    const r = await shell.run(c)
    out = r.output.map(stripAnsi)
    code = r.exitCode
  }
  return { out, text: out.join('\n'), code }
}

describe('tokenizer', () => {
  it('handles quotes, redirects and operators', () => {
    const t = tokenize(`git commit -m "feat: add 'x'" && echo hi >> a.txt ; ls`)
    expect(t.map((x) => x.value)).toEqual(['git', 'commit', '-m', "feat: add 'x'", '&&', 'echo', 'hi', '>>', 'a.txt', ';', 'ls'])
    const p = parse(`echo "a" > f.txt && cat f.txt`)
    expect(p).toHaveLength(2)
    expect(p[0]!.commands[0]!.redirect).toEqual({ path: 'f.txt', append: false })
    expect(p[0]!.next).toBe('&&')
  })
  it('parses combined short flags and values', () => {
    const r = parseArgs(['-am', 'msg', '--amend', 'file'], { flags: { '-a': 'all', '--amend': 'amend' }, values: { '-m': 'message' }, multi: ['message'] })
    expect(r.flags.has('all')).toBe(true)
    expect(r.multi['message']).toEqual(['msg'])
    expect(r.flags.has('amend')).toBe(true)
    expect(r.positional).toEqual(['file'])
  })
})

describe('shell', () => {
  let shell: Shell
  let fs: ReturnType<typeof createMemoryFs>
  beforeEach(async () => {
    const s = makeShell()
    shell = s.shell
    fs = s.fs
    await mkdirp(fs, '/home/learner/project')
    await shell.run('cd project')
  })

  it('runs file commands with redirects and chaining', async () => {
    await run(shell, 'echo "hello" > a.txt', 'echo world >> a.txt')
    expect(await readText(fs, '/home/learner/project/a.txt')).toBe('hello\nworld\n')
    const { text } = await run(shell, 'ls && cat a.txt')
    expect(text).toContain('a.txt')
    expect(text).toContain('world')
    const nf = await run(shell, 'cat nope.txt')
    expect(nf.code).toBe(1)
    expect(nf.text).toMatch(/No such file/)
    const unknown = await run(shell, 'gti status')
    expect(unknown.code).toBe(127)
    expect(unknown.text).toMatch(/Did you mean 'git'/)
  })

  it('reports not a repository and identity errors', async () => {
    const r = await run(shell, 'git status')
    expect(r.text).toMatch(/fatal: not a git repository/)
    await run(shell, 'git init')
    await run(shell, 'echo x > a.txt', 'git add a.txt')
    const c = await run(shell, 'git commit -m "x"')
    expect(c.text).toMatch(/Please tell me who you are/)
    expect(c.code).toBe(128)
  })

  it('walks through a first-day workflow with git-faithful output', async () => {
    await run(shell, 'git config --global user.name "Ada Lovelace"', 'git config --global user.email ada@example.com')
    expect((await run(shell, 'git config user.name')).text).toBe('Ada Lovelace')
    expect((await run(shell, 'git init')).text).toMatch(/Initialized empty Git repository in \/home\/learner\/project\/\.git\//)
    let st = await run(shell, 'git status')
    expect(st.text).toMatch(/On branch main\n\nNo commits yet\n\nnothing to commit/)
    await run(shell, 'echo "# Project" > README.md', 'mkdir src', 'echo "console.log(1)" > src/index.js')
    st = await run(shell, 'git status')
    expect(st.text).toMatch(/Untracked files:[\s\S]*README\.md[\s\S]*src\//)
    await run(shell, 'git add README.md')
    st = await run(shell, 'git status -s')
    expect(st.out).toEqual(['A  README.md', '?? src/'])
    const c = await run(shell, 'git commit -m "docs: add README"')
    expect(c.text).toMatch(/\[main \(root-commit\) [0-9a-f]{7}\] docs: add README\n 1 file changed, 1 insertion\(\+\)/)
    await run(shell, 'git add .', 'git commit -m "feat: add entry point"')
    const log = await run(shell, 'git log --oneline')
    expect(log.out).toHaveLength(2)
    expect(log.out[0]).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) feat: add entry point$/)
    const full = await run(shell, 'git log -1')
    expect(full.text).toMatch(/^commit [0-9a-f]{40} \(HEAD -> main\)\nAuthor: Ada Lovelace <ada@example.com>\nDate: {3}/)
    const reflog = await run(shell, 'git reflog')
    expect(reflog.out[0]).toMatch(/HEAD@\{0\}: commit: feat: add entry point/)
    expect(reflog.out[1]).toMatch(/HEAD@\{1\}: commit \(initial\): docs: add README/)
  })

  it('commits via the editor when -m is omitted', async () => {
    const s = makeShell(async () => 'Edited subject\n\nBody line\n# comment\n')
    await mkdirp(s.fs, '/home/learner/project')
    await s.shell.run('cd project')
    await run(s.shell, 'git config --global user.name A', 'git config --global user.email a@b.c', 'git init', 'echo x > a', 'git add a')
    const c = await run(s.shell, 'git commit')
    expect(c.text).toMatch(/Edited subject/)
    const show = await run(s.shell, 'git show -s')
    expect(show.text).toMatch(/Edited subject\n\s*\n {4}Body line/)
    expect(show.text).not.toMatch(/# comment/)
  })

  it('branches, merges with conflict, resolves and shows graph', async () => {
    await run(shell, 'git config --global user.name A', 'git config --global user.email a@b.c', 'git init')
    await run(shell, 'echo -e "a\\nb\\nc" > f.txt', 'git add .', 'git commit -m base')
    await run(shell, 'git switch -c feature')
    await run(shell, 'echo -e "a\\nFEATURE\\nc" > f.txt', 'git commit -am "feature change"')
    await run(shell, 'git switch main', 'echo -e "a\\nMAIN\\nc" > f.txt', 'git commit -am "main change"')
    const m = await run(shell, 'git merge feature')
    expect(m.code).toBe(1)
    expect(m.text).toMatch(/CONFLICT \(content\): Merge conflict in f.txt\nAutomatic merge failed; fix conflicts and then commit the result\./)
    const st = await run(shell, 'git status')
    expect(st.text).toMatch(/You have unmerged paths\.[\s\S]*Unmerged paths:[\s\S]*both modified: {3}f.txt/)
    const c = await run(shell, 'git commit -m "oops"')
    expect(c.text).toMatch(/unmerged files/)
    await run(shell, 'echo -e "a\\nRESOLVED\\nc" > f.txt', 'git add f.txt')
    const st2 = await run(shell, 'git status')
    expect(st2.text).toMatch(/All conflicts fixed but you are still merging/)
    const done = await run(shell, 'git commit -m "Merge feature"')
    expect(done.text).toMatch(/\[main [0-9a-f]{7}\] Merge feature/)
    const graph = await run(shell, 'git log --oneline --graph --all')
    expect(graph.out[0]).toMatch(/^\*\s+[0-9a-f]{7} \(HEAD -> main\) Merge feature/)
    expect(graph.text).toMatch(/\|\\|\|\//)
    expect(graph.out.filter((l) => l.includes('*'))).toHaveLength(4)
  })

  it('supports git add -p interactively', async () => {
    await run(shell, 'git config --global user.name A', 'git config --global user.email a@b.c', 'git init')
    const body = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\\n')
    await run(shell, `echo -e "${body}" > f.txt`, 'git add .', 'git commit -m base')
    const edited = Array.from({ length: 20 }, (_, i) => (i === 1 ? 'CHANGED TOP' : i === 18 ? 'CHANGED BOTTOM' : `line ${i + 1}`)).join('\\n')
    await run(shell, `echo -e "${edited}" > f.txt`)
    const r = await shell.run('git add -p f.txt')
    expect(r.prompt).toMatch(/\(1\/2\) Stage this hunk/)
    expect(stripAnsi(r.output.join('\n'))).toMatch(/\+CHANGED TOP/)
    const r2 = await shell.run('y')
    expect(r2.prompt).toMatch(/\(2\/2\)/)
    const r3 = await shell.run('n')
    expect(r3.prompt).toBeUndefined()
    const st = await run(shell, 'git status -s')
    expect(st.out).toEqual(['MM f.txt'])
    const staged = await run(shell, 'git diff --staged')
    expect(staged.text).toContain('+CHANGED TOP')
    expect(staged.text).not.toContain('CHANGED BOTTOM')
    const unstaged = await run(shell, 'git diff')
    expect(unstaged.text).toContain('+CHANGED BOTTOM')
    expect(unstaged.text).not.toContain('CHANGED TOP')
  })

  it('runs interactive rebase through the editor hook', async () => {
    let todoSeen = ''
    const s = makeShell(async (req) => {
      if (req.title === 'git-rebase-todo') {
        todoSeen = req.content
        const picks = req.content.split('\n').filter((l) => l.startsWith('pick'))
        return [picks[0], picks[1]!.replace('pick', 'squash'), picks[2]!.replace('pick', 'drop')].join('\n')
      }
      return 'Combined work\n'
    })
    await mkdirp(s.fs, '/home/learner/project')
    await s.shell.run('cd project')
    await run(
      s.shell,
      'git config --global user.name A',
      'git config --global user.email a@b.c',
      'git init',
      'echo 0 > base && git add . && git commit -m base',
    )
    await run(
      s.shell,
      'echo 1 > a && git add . && git commit -m "wip a"',
      'echo 2 > b && git add . && git commit -m "wip b"',
      'echo 3 > c && git add . && git commit -m "mistake"',
    )
    const r = await run(s.shell, 'git rebase -i HEAD~3')
    expect(r.text).toMatch(/Successfully rebased and updated refs\/heads\/main/)
    expect(todoSeen).toMatch(/^pick [0-9a-f]{7} wip a\npick [0-9a-f]{7} wip b\npick [0-9a-f]{7} mistake\n/)
    const log = await run(s.shell, 'git log --oneline')
    expect(log.out.map((l) => l.replace(/^[0-9a-f]{7} (\([^)]*\) )?/, ''))).toEqual(['Combined work', 'base'])
    const ls = await run(s.shell, 'ls')
    expect(ls.text).not.toContain('c')
    expect(ls.text).toContain('b')
  })

  it('stash, reset --hard and reflog recovery', async () => {
    await run(shell, 'git config --global user.name A', 'git config --global user.email a@b.c', 'git init', 'echo 1 > a && git add . && git commit -m one')
    await run(shell, 'echo 2 > a')
    const st = await run(shell, 'git stash')
    expect(st.text).toMatch(/Saved working directory and index state WIP on main: [0-9a-f]{7} one/)
    expect((await run(shell, 'git stash list')).out[0]).toMatch(/^stash@\{0\}: WIP on main/)
    await run(shell, 'git stash pop')
    expect(await readText(fs, '/home/learner/project/a')).toBe('2\n')
    await run(shell, 'git commit -am two')
    const hard = await run(shell, 'git reset --hard HEAD~1')
    expect(hard.text).toMatch(/HEAD is now at [0-9a-f]{7} one/)
    const rl = await run(shell, 'git reflog')
    expect(rl.out[0]).toMatch(/HEAD@\{0\}: reset: moving to HEAD~1/)
    expect(rl.out[1]).toMatch(/HEAD@\{1\}: commit: two/)
    await run(shell, 'git reset --hard HEAD@{1}')
    expect(await readText(fs, '/home/learner/project/a')).toBe('2\n')
  })

  it('gives clear messages for unsupported or mistyped commands', async () => {
    await run(shell, 'git init')
    const r = await run(shell, 'git comit')
    expect(r.text).toMatch(/git: 'comit' is not a git command/)
    expect(r.text).toMatch(/commit/)
    const r2 = await run(shell, 'git bisect run ./test.sh')
    expect(r2.text).toMatch(/fatal: 'git bisect run' needs a test script/)
    const r3 = await run(shell, 'git clone https://example.com/repo.git')
    expect(r3.text).toMatch(/runs fully in your browser/)
  })
})

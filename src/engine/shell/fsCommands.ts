import { basename, dirname, exists, isDir, isFile, join, listFilesRecursive, mkdirp, readText, relative, resolve, rmrf, writeFileDeep } from '../fs'
import { CommandError, type CommandContext } from './types'
import { ansi } from './format'

type Cmd = (ctx: CommandContext, argv: string[]) => Promise<number | void>

function display(ctx: CommandContext, abs: string): string {
  if (abs === ctx.home) return '~'
  if (abs.startsWith(ctx.home + '/')) return '~' + abs.slice(ctx.home.length)
  return abs
}

const ls: Cmd = async (ctx, argv) => {
  const all = argv.includes('-a') || argv.includes('-la') || argv.includes('-al')
  const long = argv.includes('-l') || argv.includes('-la') || argv.includes('-al')
  const targets = argv.filter((a) => !a.startsWith('-'))
  if (!targets.length) targets.push('.')
  for (const t of targets) {
    const abs = ctx.resolve(t)
    if (!(await exists(ctx.fs, abs))) throw new CommandError(`ls: cannot access '${t}': No such file or directory`, 2)
    if (await isFile(ctx.fs, abs)) {
      ctx.out.push(t)
      continue
    }
    if (targets.length > 1) ctx.out.push(`${t}:`)
    const names = (await ctx.fs.promises.readdir(abs)).sort((a, b) => a.localeCompare(b))
    const shown = names.filter((n) => all || !n.startsWith('.'))
    const items: string[] = []
    for (const n of shown) {
      const dir = await isDir(ctx.fs, join(abs, n))
      const label = dir ? ansi.blue(n + '/') : n
      if (long) {
        const st = await ctx.fs.promises.stat(join(abs, n))
        items.push(`${dir ? 'd' : '-'}rw-r--r--  ${String(st.size ?? 0).padStart(6)}  ${label}`)
      } else items.push(label)
    }
    if (long) ctx.out.push(...items)
    else if (items.length) ctx.out.push(items.join('  '))
  }
}

const cd: Cmd = async (ctx, argv) => {
  const target = argv[0] ?? ctx.home
  const abs = target === '~' ? ctx.home : target.startsWith('~/') ? join(ctx.home, target.slice(2)) : ctx.resolve(target)
  if (!(await exists(ctx.fs, abs))) throw new CommandError(`cd: no such file or directory: ${target}`)
  if (!(await isDir(ctx.fs, abs))) throw new CommandError(`cd: not a directory: ${target}`)
  ctx.setCwd(abs)
}

const pwd: Cmd = async (ctx) => {
  ctx.out.push(ctx.cwd)
}

const cat: Cmd = async (ctx, argv) => {
  const files = argv.filter((a) => !a.startsWith('-'))
  if (!files.length) {
    if (ctx.stdin) ctx.out.push(...ctx.stdin)
    return
  }
  const numbered = argv.includes('-n')
  for (const f of files) {
    const abs = ctx.resolve(f)
    if (!(await exists(ctx.fs, abs))) throw new CommandError(`cat: ${f}: No such file or directory`)
    if (await isDir(ctx.fs, abs)) throw new CommandError(`cat: ${f}: Is a directory`)
    const text = await readText(ctx.fs, abs)
    const lines = text.replace(/\n$/, '').split('\n')
    if (text === '') continue
    ctx.out.push(...(numbered ? lines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}`) : lines))
  }
}

const echo: Cmd = async (ctx, argv) => {
  let args = argv
  let newline = true
  let escapes = false
  while (args[0] === '-n' || args[0] === '-e') {
    if (args[0] === '-n') newline = false
    if (args[0] === '-e') escapes = true
    args = args.slice(1)
  }
  let text = args.join(' ')
  if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  const lines = text.split('\n')
  ctx.out.push(...lines)
  void newline
}

const touch: Cmd = async (ctx, argv) => {
  const files = argv.filter((a) => !a.startsWith('-'))
  if (!files.length) throw new CommandError('touch: missing file operand')
  for (const f of files) {
    const abs = ctx.resolve(f)
    if (!(await exists(ctx.fs, abs))) {
      if (!(await exists(ctx.fs, dirname(abs)))) throw new CommandError(`touch: cannot touch '${f}': No such file or directory`)
      await writeFileDeep(ctx.fs, abs, '')
    }
  }
  ctx.events.push({ type: 'fs-changed' })
}

const mkdir: Cmd = async (ctx, argv) => {
  const parents = argv.includes('-p')
  const dirs = argv.filter((a) => !a.startsWith('-'))
  if (!dirs.length) throw new CommandError('mkdir: missing operand')
  for (const d of dirs) {
    const abs = ctx.resolve(d)
    if (await exists(ctx.fs, abs)) {
      if (parents) continue
      throw new CommandError(`mkdir: cannot create directory '${d}': File exists`)
    }
    if (!parents && !(await exists(ctx.fs, dirname(abs)))) throw new CommandError(`mkdir: cannot create directory '${d}': No such file or directory`)
    await mkdirp(ctx.fs, abs)
  }
  ctx.events.push({ type: 'fs-changed' })
}

const rm: Cmd = async (ctx, argv) => {
  const flags = argv.filter((a) => a.startsWith('-')).join('')
  const recursive = flags.includes('r') || flags.includes('R')
  const force = flags.includes('f')
  const files = argv.filter((a) => !a.startsWith('-'))
  if (!files.length) throw new CommandError('rm: missing operand')
  for (const f of files) {
    const abs = ctx.resolve(f)
    if (!(await exists(ctx.fs, abs))) {
      if (force) continue
      throw new CommandError(`rm: cannot remove '${f}': No such file or directory`)
    }
    if ((await isDir(ctx.fs, abs)) && !recursive) throw new CommandError(`rm: cannot remove '${f}': Is a directory`)
    if (abs === ctx.home || abs === '/') throw new CommandError(`rm: refusing to remove '${f}'`)
    await rmrf(ctx.fs, abs)
  }
  ctx.events.push({ type: 'fs-changed' })
}

const mv: Cmd = async (ctx, argv) => {
  const files = argv.filter((a) => !a.startsWith('-'))
  if (files.length < 2) throw new CommandError('mv: missing destination file operand')
  const dest = ctx.resolve(files[files.length - 1]!)
  const sources = files.slice(0, -1)
  const destIsDir = await isDir(ctx.fs, dest)
  if (sources.length > 1 && !destIsDir) throw new CommandError(`mv: target '${files[files.length - 1]}' is not a directory`)
  for (const s of sources) {
    const abs = ctx.resolve(s)
    if (!(await exists(ctx.fs, abs))) throw new CommandError(`mv: cannot stat '${s}': No such file or directory`)
    const target = destIsDir ? join(dest, basename(abs)) : dest
    await moveTree(ctx, abs, target)
  }
  ctx.events.push({ type: 'fs-changed' })
}

async function moveTree(ctx: CommandContext, from: string, to: string) {
  if (await isDir(ctx.fs, from)) {
    await mkdirp(ctx.fs, to)
    for (const name of await ctx.fs.promises.readdir(from)) await moveTree(ctx, join(from, name), join(to, name))
    await ctx.fs.promises.rmdir(from)
  } else {
    const data = await ctx.fs.promises.readFile(from)
    await writeFileDeep(ctx.fs, to, data as Uint8Array)
    await ctx.fs.promises.unlink(from)
  }
}

const cp: Cmd = async (ctx, argv) => {
  const recursive = argv.some((a) => a.startsWith('-') && a.includes('r'))
  const files = argv.filter((a) => !a.startsWith('-'))
  if (files.length < 2) throw new CommandError('cp: missing destination file operand')
  const dest = ctx.resolve(files[files.length - 1]!)
  const destIsDir = await isDir(ctx.fs, dest)
  for (const s of files.slice(0, -1)) {
    const abs = ctx.resolve(s)
    if (!(await exists(ctx.fs, abs))) throw new CommandError(`cp: cannot stat '${s}': No such file or directory`)
    if (await isDir(ctx.fs, abs)) {
      if (!recursive) throw new CommandError(`cp: -r not specified; omitting directory '${s}'`)
      const target = destIsDir ? join(dest, basename(abs)) : dest
      for (const f of await listFilesRecursive(ctx.fs, abs, false)) {
        await writeFileDeep(ctx.fs, join(target, relative(abs, f)), (await ctx.fs.promises.readFile(f)) as Uint8Array)
      }
    } else {
      const target = destIsDir ? join(dest, basename(abs)) : dest
      await writeFileDeep(ctx.fs, target, (await ctx.fs.promises.readFile(abs)) as Uint8Array)
    }
  }
  ctx.events.push({ type: 'fs-changed' })
}

const clear: Cmd = async (ctx) => {
  ctx.events.push({ type: 'clear' })
}

const tree: Cmd = async (ctx, argv) => {
  const all = argv.includes('-a')
  const root = ctx.resolve(argv.find((a) => !a.startsWith('-')) ?? '.')
  if (!(await isDir(ctx.fs, root))) throw new CommandError(`tree: '${argv[0]}': No such directory`)
  ctx.out.push(display(ctx, root) === '~' ? '~' : basename(root) || '/')
  let dirs = 0
  let files = 0
  async function walk(dir: string, prefix: string) {
    const names = (await ctx.fs.promises.readdir(dir)).filter((n) => all || !n.startsWith('.')).sort()
    for (let i = 0; i < names.length; i++) {
      const n = names[i]!
      const last = i === names.length - 1
      const full = join(dir, n)
      const d = await isDir(ctx.fs, full)
      ctx.out.push(`${prefix}${last ? '└── ' : '├── '}${d ? ansi.blue(n) : n}`)
      if (d) {
        dirs++
        await walk(full, prefix + (last ? '    ' : '│   '))
      } else files++
    }
  }
  await walk(root, '')
  ctx.out.push('', `${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`)
}

const headTail =
  (which: 'head' | 'tail'): Cmd =>
  async (ctx, argv) => {
    let n = 10
    const files: string[] = []
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]!
      if (a === '-n') n = parseInt(argv[++i] ?? '10', 10)
      else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10)
      else files.push(a)
    }
    const sources: string[][] = []
    if (!files.length && ctx.stdin) sources.push(ctx.stdin)
    for (const f of files) {
      const abs = ctx.resolve(f)
      if (!(await exists(ctx.fs, abs))) throw new CommandError(`${which}: cannot open '${f}' for reading: No such file or directory`)
      sources.push((await readText(ctx.fs, abs)).replace(/\n$/, '').split('\n'))
    }
    for (const lines of sources) ctx.out.push(...(which === 'head' ? lines.slice(0, n) : lines.slice(-n)))
  }

const grep: Cmd = async (ctx, argv) => {
  const flags = argv.filter((a) => a.startsWith('-') && a.length > 1).join('')
  const rest = argv.filter((a) => !a.startsWith('-') || a === '-')
  const recursive = flags.includes('r')
  const lineNumbers = flags.includes('n')
  const ignoreCase = flags.includes('i')
  const pattern = rest[0]
  if (!pattern) throw new CommandError('usage: grep [-rni] PATTERN [FILE...]', 2)
  const re = new RegExp(pattern, ignoreCase ? 'i' : '')
  const targets = rest.slice(1)
  const files: string[] = []
  if (!targets.length) {
    if (ctx.stdin) {
      ctx.stdin.forEach((l, i) => {
        if (re.test(l)) ctx.out.push(lineNumbers ? `${i + 1}:${l}` : l)
      })
      return ctx.out.length ? 0 : 1
    }
    if (recursive) targets.push('.')
    else throw new CommandError('usage: grep [-rni] PATTERN [FILE...]', 2)
  }
  for (const t of targets) {
    const abs = ctx.resolve(t)
    if (!(await exists(ctx.fs, abs))) throw new CommandError(`grep: ${t}: No such file or directory`, 2)
    if (await isDir(ctx.fs, abs)) {
      if (!recursive) throw new CommandError(`grep: ${t}: Is a directory`, 2)
      files.push(...(await listFilesRecursive(ctx.fs, abs, true)))
    } else files.push(abs)
  }
  let matched = false
  for (const f of files) {
    const text = await readText(ctx.fs, f)
    const rel = relative(ctx.cwd, f)
    text
      .replace(/\n$/, '')
      .split('\n')
      .forEach((l, i) => {
        if (re.test(l)) {
          matched = true
          const prefix = files.length > 1 ? `${ansi.magenta(rel)}${ansi.cyan(':')}` : ''
          const num = lineNumbers ? `${ansi.green(String(i + 1))}${ansi.cyan(':')}` : ''
          ctx.out.push(`${prefix}${num}${l}`)
        }
      })
  }
  return matched ? 0 : 1
}

const openFile: Cmd = async (ctx, argv) => {
  const f = argv.find((a) => !a.startsWith('-'))
  if (!f) throw new CommandError('usage: code <file>')
  const abs = ctx.resolve(f)
  if (!(await exists(ctx.fs, abs))) {
    if (!(await exists(ctx.fs, dirname(abs)))) throw new CommandError(`code: cannot open '${f}': No such file or directory`)
    await writeFileDeep(ctx.fs, abs, '')
    ctx.events.push({ type: 'fs-changed' })
  }
  if (await isDir(ctx.fs, abs)) throw new CommandError(`code: '${f}' is a directory`)
  ctx.events.push({ type: 'open-file', path: abs })
  ctx.out.push(ansi.gray(`Opened ${display(ctx, abs)} in the editor.`))
}

const whoami: Cmd = async (ctx) => {
  ctx.out.push('learner')
}

const wc: Cmd = async (ctx, argv) => {
  const flags = argv.filter((a) => a.startsWith('-')).join('')
  const files = argv.filter((a) => !a.startsWith('-'))
  const sources: { name: string; text: string }[] = []
  if (!files.length && ctx.stdin) sources.push({ name: '', text: ctx.stdin.join('\n') + '\n' })
  for (const f of files) {
    const abs = ctx.resolve(f)
    if (!(await exists(ctx.fs, abs))) throw new CommandError(`wc: ${f}: No such file or directory`)
    sources.push({ name: f, text: await readText(ctx.fs, abs) })
  }
  for (const s of sources) {
    const lines = (s.text.match(/\n/g) ?? []).length
    const words = s.text.split(/\s+/).filter(Boolean).length
    const bytes = new TextEncoder().encode(s.text).length
    const parts: string[] = []
    if (!flags || flags.includes('l')) parts.push(String(lines).padStart(4))
    if (!flags || flags.includes('w')) parts.push(String(words).padStart(4))
    if (!flags || flags.includes('c')) parts.push(String(bytes).padStart(4))
    ctx.out.push(`${parts.join(' ')} ${s.name}`.trimEnd())
  }
}

const help: Cmd = async (ctx) => {
  ctx.out.push(
    ansi.bold('Commit Lab shell'),
    'Files:   ls  cd  pwd  cat  echo  touch  mkdir  rm  mv  cp  tree  head  tail  grep  wc  code <file>  clear',
    'Git:     git <command>   (init, status, add, commit, log, diff, show, branch, switch, checkout, merge,',
    '         rebase, cherry-pick, revert, reset, restore, stash, tag, remote, fetch, pull, push, reflog, blame, bisect, config)',
    'Tips:    Redirect with > and >> (echo "text" >> file.txt). Chain with && and ;.',
    '         Run `git help <command>` for a short reference on any git command.',
  )
}

export const fsCommands: Record<string, Cmd> = {
  ls,
  cd,
  pwd,
  cat,
  echo,
  touch,
  mkdir,
  rm,
  mv,
  cp,
  clear,
  tree,
  head: headTail('head'),
  tail: headTail('tail'),
  grep,
  code: openFile,
  nano: openFile,
  vim: openFile,
  vi: openFile,
  open: openFile,
  whoami,
  wc,
  help,
  true: async () => 0,
  false: async () => 1,
  exit: async (ctx) => {
    ctx.out.push(ansi.gray('This terminal stays open for the lab. Use the lab controls to leave or reset.'))
  },
}

export { resolve as resolvePath }

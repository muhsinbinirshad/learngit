import type { FsClient } from '../fs'
import { exists, isDir, join, resolve as resolvePath, readTextOrNull, writeFileDeep, basename, dirname } from '../fs'
import { systemClock, type Clock } from '../git/repo'
import { parse, ShellSyntaxError, type SimpleCommand } from './tokenize'
import { fsCommands } from './fsCommands'
import { runGit } from './git/index'
import { CommandError, type CommandContext, type Interaction, type RunResult, type ShellEvent, type ShellIO, type ShellOptions } from './types'
import { ansi } from './format'

export interface ExecutedCommand {
  input: string
  exitCode: number
  at: number
}

/** The learner's shell. Stateless between commands apart from cwd, history and a pending interaction. */
export class Shell {
  readonly fs: FsClient
  readonly home: string
  readonly io: ShellIO
  readonly clock: Clock
  cwd: string
  history: ExecutedCommand[] = []
  private interaction: Interaction | null = null

  constructor(opts: ShellOptions) {
    this.fs = opts.fs
    this.home = opts.home
    this.io = opts.io
    this.clock = opts.clock ?? systemClock
    this.cwd = opts.cwd ?? opts.home
  }

  /** Prompt text, e.g. `~/project (main)$`. Branch info is filled in by the caller. */
  displayPath(): string {
    if (this.cwd === this.home) return '~'
    if (this.cwd.startsWith(this.home + '/')) return '~' + this.cwd.slice(this.home.length)
    return this.cwd
  }

  get awaitingInput(): string | null {
    return this.interaction?.prompt ?? null
  }

  async run(input: string): Promise<RunResult> {
    const trimmed = input.trim()
    if (this.interaction) {
      const i = this.interaction
      const r = await i.handle(input)
      if (r.done) this.interaction = null
      else if (r.prompt) i.prompt = r.prompt
      return { output: r.output, exitCode: 0, events: [{ type: 'repo-changed' }], prompt: this.interaction?.prompt }
    }
    if (!trimmed) return { output: [], exitCode: 0, events: [] }

    const output: string[] = []
    const events: ShellEvent[] = []
    let exitCode: number
    try {
      const pipelines = parse(trimmed)
      let prev: '&&' | '||' | ';' | undefined
      let lastCode = 0
      for (const p of pipelines) {
        if (prev === '&&' && lastCode !== 0) {
          prev = p.next
          continue
        }
        if (prev === '||' && lastCode === 0) {
          prev = p.next
          continue
        }
        lastCode = await this.runPipeline(p.commands, output, events)
        prev = p.next
        if (this.interaction) break
      }
      exitCode = lastCode
    } catch (e) {
      if (e instanceof ShellSyntaxError) {
        output.push(`-shell: syntax error: ${e.message}`)
        exitCode = 2
      } else throw e
    }
    this.history.push({ input: trimmed, exitCode, at: this.clock.now() })
    const pending = this.interaction as Interaction | null
    return { output, exitCode, events, prompt: pending?.prompt }
  }

  private async runPipeline(commands: SimpleCommand[], output: string[], events: ShellEvent[]): Promise<number> {
    let stdin: string[] | undefined
    let code = 0
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!
      const isLast = i === commands.length - 1
      const out: string[] = []
      code = await this.runSimple(cmd, out, events, stdin)
      if (cmd.redirect) {
        const abs = this.resolve(cmd.redirect.path)
        if (!(await exists(this.fs, dirname(abs)))) {
          output.push(`-shell: ${cmd.redirect.path}: No such file or directory`)
          return 1
        }
        const prev = cmd.redirect.append ? ((await readTextOrNull(this.fs, abs)) ?? '') : ''
        const text = out.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '')).join('\n')
        await writeFileDeep(this.fs, abs, prev + (out.length ? text + '\n' : ''))
        events.push({ type: 'fs-changed' })
        stdin = undefined
        continue
      }
      if (isLast) output.push(...out)
      else stdin = out.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''))
    }
    return code
  }

  private async runSimple(cmd: SimpleCommand, out: string[], events: ShellEvent[], stdin?: string[]): Promise<number> {
    const argv = await this.expandGlobs(cmd)
    const name = argv[0]
    if (!name) return 0
    const ctx: CommandContext = {
      fs: this.fs,
      cwd: this.cwd,
      home: this.home,
      io: this.io,
      clock: this.clock,
      out,
      events,
      stdin,
      setCwd: (p) => {
        this.cwd = p
        ctx.cwd = p
      },
      resolve: (p) => this.resolve(p),
    }
    try {
      if (name === 'git') {
        const code = await runGit(ctx, argv.slice(1))
        if (ctx.interaction) this.interaction = ctx.interaction
        events.push({ type: 'repo-changed' })
        return code
      }
      const handler = fsCommands[name]
      if (!handler) {
        out.push(`-shell: ${name}: command not found`)
        if (/^(gti|got|gut|igt)$/.test(name)) out.push(ansi.gray(`Did you mean 'git'?`))
        return 127
      }
      const code = await handler(ctx, argv.slice(1))
      return code ?? 0
    } catch (e) {
      if (e instanceof CommandError) {
        out.push(`${name}: ${e.message}`.replace(/^git: /, ''))
        return e.exitCode
      }
      throw e
    }
  }

  resolve(p: string): string {
    if (p === '~') return this.home
    if (p.startsWith('~/')) return join(this.home, p.slice(2))
    return resolvePath(this.cwd, p)
  }

  /** Expand `*` and `?` in unquoted words against the filesystem (single directory level). */
  private async expandGlobs(cmd: SimpleCommand): Promise<string[]> {
    const out: string[] = []
    for (let i = 0; i < cmd.argv.length; i++) {
      const word = cmd.argv[i]!
      if (cmd.quoted[i] || !/[*?]/.test(word) || word.startsWith('-')) {
        out.push(word)
        continue
      }
      const dir = word.includes('/') ? word.slice(0, word.lastIndexOf('/')) : ''
      const pattern = word.includes('/') ? word.slice(word.lastIndexOf('/') + 1) : word
      const absDir = this.resolve(dir || '.')
      if (!(await isDir(this.fs, absDir))) {
        out.push(word)
        continue
      }
      const re = new RegExp(
        '^' +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.') +
          '$',
      )
      const names = (await this.fs.promises.readdir(absDir)).filter((n) => !n.startsWith('.') && re.test(n)).sort()
      if (!names.length) out.push(word)
      else out.push(...names.map((n) => (dir ? `${dir}/${n}` : n)))
    }
    return out
  }
}

export { basename }

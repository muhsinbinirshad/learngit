import type { FsClient } from '../fs'
import type { Clock } from '../git/repo'

export interface EditorRequest {
  title: string
  content: string
  language?: string
  /** Short instruction shown above the editor. */
  help?: string
}

/** Hooks the UI provides to the shell. Tests supply simple implementations. */
export interface ShellIO {
  openEditor(req: EditorRequest): Promise<string | null>
}

export interface ShellOptions {
  fs: FsClient
  /** Learner's home directory, shown as ~ in the prompt. */
  home: string
  cwd?: string
  io: ShellIO
  clock?: Clock
}

export type ShellEvent = { type: 'clear' } | { type: 'open-file'; path: string } | { type: 'fs-changed' } | { type: 'repo-changed' }

export interface RunResult {
  /** Output lines (may include ANSI). */
  output: string[]
  exitCode: number
  events: ShellEvent[]
  /** When set, the shell is waiting for an answer to an interactive prompt. */
  prompt?: string
}

/** A running interactive dialogue (e.g. `git add -p`). Receives raw input lines. */
export interface Interaction {
  prompt: string
  handle(line: string): Promise<{ output: string[]; done: boolean; prompt?: string }>
}

export interface CommandContext {
  fs: FsClient
  cwd: string
  home: string
  io: ShellIO
  clock: Clock
  out: string[]
  events: ShellEvent[]
  /** Set by git commands to describe the HEAD movement for the reflog. */
  reflogMessage?: string
  /** Set by a command to start an interactive dialogue. */
  interaction?: Interaction
  /** Stdin piped from a previous command (`echo x | cmd`). */
  stdin?: string[]
  setCwd(path: string): void
  resolve(path: string): string
}

export class CommandError extends Error {
  exitCode: number
  constructor(message: string, exitCode = 1) {
    super(message)
    this.exitCode = exitCode
  }
}

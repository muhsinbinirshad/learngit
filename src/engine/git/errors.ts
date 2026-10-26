/** Error with a git-style message. `fatal` controls the prefix the shell prints. */
export class GitError extends Error {
  readonly exitCode: number
  readonly prefix: 'fatal' | 'error' | 'none'
  constructor(message: string, opts: { exitCode?: number; prefix?: 'fatal' | 'error' | 'none' } = {}) {
    super(message)
    this.name = 'GitError'
    this.exitCode = opts.exitCode ?? 128
    this.prefix = opts.prefix ?? 'fatal'
  }
}

export function fatal(message: string): GitError {
  return new GitError(message, { prefix: 'fatal' })
}
export function gitErr(message: string, exitCode = 1): GitError {
  return new GitError(message, { prefix: 'error', exitCode })
}
/** Plain, already-formatted multi-line output that should be shown as-is (e.g. rejected push). */
export function plain(message: string, exitCode = 1): GitError {
  return new GitError(message, { prefix: 'none', exitCode })
}

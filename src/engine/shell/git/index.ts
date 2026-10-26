import { GitError } from '../../git/errors'
import type { CommandContext } from '../types'
import { ansi } from '../format'
import { findRepo } from './context'
import { basics } from './basics'
import { history } from './history'
import { branches } from './branches'
import { remotes } from './remotes'
import { helpText } from './help'

export type GitSubcommand = (ctx: CommandContext, args: string[]) => Promise<number | void>

const subcommands: Record<string, GitSubcommand> = {
  ...basics,
  ...history,
  ...branches,
  ...remotes,
}

/** Commands whose output changes HEAD; wrapped to maintain the reflog. */
const HEAD_MOVERS = new Set(['commit', 'checkout', 'switch', 'merge', 'rebase', 'reset', 'cherry-pick', 'revert', 'pull', 'bisect', 'stash', 'am'])

export async function runGit(ctx: CommandContext, args: string[]): Promise<number> {
  const [name, ...rest] = args
  if (!name || name === '--help' || name === 'help') {
    const topic = name === 'help' ? rest[0] : undefined
    ctx.out.push(...helpText(topic))
    return 0
  }
  if (name === '--version') {
    ctx.out.push('git version 2.45.0 (Commit Lab in-browser engine)')
    return 0
  }
  const handler = subcommands[name]
  if (!handler) {
    ctx.out.push(`git: '${name}' is not a git command. See 'git --help'.`)
    const close = Object.keys(subcommands).filter((c) => c.startsWith(name.slice(0, 2)) || levenshtein(c, name) <= 2)
    if (close.length) ctx.out.push('', 'The most similar command' + (close.length > 1 ? 's are' : ' is'), ...close.map((c) => `\t${c}`))
    return 1
  }

  // Reflog bookkeeping: record HEAD movement caused by this command.
  let repoBefore: Awaited<ReturnType<typeof findRepo>> | null = null
  let headBefore: string | null = null
  if (HEAD_MOVERS.has(name)) {
    try {
      repoBefore = await findRepo(ctx)
      headBefore = await repoBefore.headOid()
    } catch {
      /* not in a repo; the command will report it */
    }
  }
  try {
    const code = (await handler(ctx, rest)) ?? 0
    if (repoBefore) {
      const headAfter = await repoBefore.headOid()
      if (headAfter && headAfter !== headBefore) {
        await repoBefore.appendReflog('HEAD', headBefore, headAfter, ctx.reflogMessage ?? `${name}: moving to ${headAfter.slice(0, 7)}`)
        const branch = await repoBefore.currentBranch()
        if (branch) await repoBefore.appendReflog(`refs/heads/${branch}`, headBefore, headAfter, ctx.reflogMessage ?? `${name}`)
      }
    }
    return code
  } catch (e) {
    if (e instanceof GitError) {
      const lines = e.message.split('\n')
      if (e.prefix === 'none') ctx.out.push(...lines)
      else {
        ctx.out.push(...lines.map((l, i) => (i === 0 ? `${e.prefix}: ${l}` : l)))
      }
      return e.exitCode
    }
    if (e instanceof Error && /requires a value|switch '/.test(e.message)) {
      ctx.out.push(`error: ${e.message}`)
      return 129
    }
    const message = e instanceof Error ? e.message : String(e)
    ctx.out.push(
      ansi.red(`Commit Lab: the in-browser Git engine hit an unexpected error running 'git ${name}'.`),
      ansi.gray(message),
      ansi.gray('Your repository was not changed by this failure. If it persists, use "Reset lab".'),
    )
    return 128
  }
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length]![b.length]!
}

/** Standard message for flags this environment does not implement. */
export function unsupported(what: string, alternative?: string): GitError {
  return new GitError(`${what} is not available in the Commit Lab environment.${alternative ? ` ${alternative}` : ''}`, { prefix: 'none', exitCode: 129 })
}

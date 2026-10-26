import type { FsClient } from '@/engine/fs'
import { isDir } from '@/engine/fs'

const GIT_SUBCOMMANDS = [
  'add',
  'bisect',
  'blame',
  'branch',
  'checkout',
  'cherry-pick',
  'clone',
  'commit',
  'config',
  'diff',
  'fetch',
  'init',
  'log',
  'merge',
  'mv',
  'pull',
  'push',
  'rebase',
  'reflog',
  'remote',
  'reset',
  'restore',
  'revert',
  'rm',
  'show',
  'stash',
  'status',
  'switch',
  'tag',
]
const SHELL_COMMANDS = [
  'cat',
  'cd',
  'clear',
  'code',
  'cp',
  'echo',
  'git',
  'grep',
  'head',
  'help',
  'ls',
  'mkdir',
  'mv',
  'pwd',
  'rm',
  'tail',
  'touch',
  'tree',
  'wc',
]

/** Tab-completion candidates for the current word. Returns the full replacement words. */
export async function complete(fs: FsClient, cwd: string, home: string, lineBefore: string, word: string, branches: string[]): Promise<string[]> {
  const tokens = lineBefore.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return SHELL_COMMANDS.filter((c) => c.startsWith(word))
  if (tokens[0] === 'git' && tokens.length === 1) return GIT_SUBCOMMANDS.filter((c) => c.startsWith(word))
  if (tokens[0] === 'git' && ['switch', 'checkout', 'merge', 'rebase', 'branch'].includes(tokens[1] ?? '') && !word.includes('/') && !word.startsWith('-')) {
    const fromBranches = branches.filter((b) => b.startsWith(word))
    const fromFiles = await completePath(fs, cwd, home, word)
    return [...new Set([...fromBranches, ...fromFiles])]
  }
  return completePath(fs, cwd, home, word)
}

async function completePath(fs: FsClient, cwd: string, home: string, word: string): Promise<string[]> {
  const slash = word.lastIndexOf('/')
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : ''
  const base = slash >= 0 ? word.slice(slash + 1) : word
  const absDir = dirPart.startsWith('/') ? dirPart : dirPart.startsWith('~') ? home + dirPart.slice(1) : `${cwd}/${dirPart}`
  let names: string[]
  try {
    names = await fs.promises.readdir(absDir.replace(/\/+$/, '') || '/')
  } catch {
    return []
  }
  const out: string[] = []
  for (const n of names.sort()) {
    if (!n.startsWith(base)) continue
    if (n.startsWith('.') && !base.startsWith('.')) continue
    const d = await isDir(fs, `${absDir}/${n}`)
    out.push(dirPart + n + (d ? '/' : ''))
  }
  return out
}

/** Longest common prefix of candidate strings. */
export function commonPrefix(items: string[]): string {
  if (!items.length) return ''
  let p = items[0]!
  for (const s of items.slice(1)) {
    let i = 0
    while (i < p.length && i < s.length && p[i] === s[i]) i++
    p = p.slice(0, i)
  }
  return p
}

import git from 'isomorphic-git'
import type { FsClient } from '../fs'
import { readTextOrNull, writeFileDeep } from '../fs'
import { fatal } from './errors'

export interface Identity {
  name: string
  email: string
}

export const GLOBAL_CONFIG_PATH = '/home/learner/.gitconfig'

/** Parse a minimal INI (sections + key = value). Enough for user.*, core.*, init.*, alias.*. */
export function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let section = ''
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const sec = /^\[([^\]]+)\]$/.exec(line)
    if (sec) {
      const inner = sec[1]!.trim()
      const sub = /^(\S+)\s+"(.*)"$/.exec(inner)
      section = sub ? `${sub[1]}.${sub[2]}` : inner
      continue
    }
    const kv = /^([^=]+?)\s*=\s*(.*)$/.exec(line)
    if (kv) {
      let v = kv[2]!.trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      out[`${section}.${kv[1]!.trim()}`] = v
    }
  }
  return out
}

export function serializeIni(entries: Record<string, string>): string {
  const sections = new Map<string, string[]>()
  for (const [key, value] of Object.entries(entries)) {
    const idx = key.lastIndexOf('.')
    const section = key.slice(0, idx)
    const name = key.slice(idx + 1)
    const dot = section.indexOf('.')
    const header = dot >= 0 ? `[${section.slice(0, dot)} "${section.slice(dot + 1)}"]` : `[${section}]`
    if (!sections.has(header)) sections.set(header, [])
    sections.get(header)!.push(`\t${name} = ${value}`)
  }
  return [...sections.entries()].map(([h, lines]) => [h, ...lines].join('\n')).join('\n') + '\n'
}

export async function readGlobalConfig(fs: FsClient): Promise<Record<string, string>> {
  const text = await readTextOrNull(fs, GLOBAL_CONFIG_PATH)
  return text ? parseIni(text) : {}
}

export async function writeGlobalConfig(fs: FsClient, entries: Record<string, string>): Promise<void> {
  await writeFileDeep(fs, GLOBAL_CONFIG_PATH, serializeIni(entries))
}

export async function setGlobalConfig(fs: FsClient, key: string, value: string | null): Promise<void> {
  const cfg = await readGlobalConfig(fs)
  if (value === null) delete cfg[key]
  else cfg[key] = value
  await writeGlobalConfig(fs, cfg)
}

/** Repo-local value, then global value. */
export async function getConfigValue(fs: FsClient, gitdir: string | null, key: string): Promise<string | undefined> {
  if (gitdir) {
    try {
      const local = await git.getConfig({ fs, gitdir, path: key })
      if (local !== undefined && local !== null) return String(local)
    } catch {
      /* no repo config */
    }
  }
  const globalCfg = await readGlobalConfig(fs)
  return globalCfg[key]
}

export async function resolveIdentity(fs: FsClient, gitdir: string | null): Promise<Identity> {
  const name = await getConfigValue(fs, gitdir, 'user.name')
  const email = await getConfigValue(fs, gitdir, 'user.email')
  if (!name || !email) {
    throw fatal(
      [
        'Author identity unknown',
        '',
        '*** Please tell me who you are.',
        '',
        'Run',
        '',
        '  git config --global user.email "you@example.com"',
        '  git config --global user.name "Your Name"',
        '',
        "to set your account's default identity.",
      ].join('\n'),
    )
  }
  return { name, email }
}

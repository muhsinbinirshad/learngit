import type { FsClient } from './types'
import { join } from './path'

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? enc.encode(data) : data
}
export function toText(data: string | Uint8Array): string {
  return typeof data === 'string' ? data : dec.decode(data)
}

export async function exists(fs: FsClient, path: string): Promise<boolean> {
  try {
    await fs.promises.lstat(path)
    return true
  } catch {
    return false
  }
}

export async function isDir(fs: FsClient, path: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function isFile(fs: FsClient, path: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(path)).isFile()
  } catch {
    return false
  }
}

export async function readText(fs: FsClient, path: string): Promise<string> {
  return toText(await fs.promises.readFile(path))
}

export async function readTextOrNull(fs: FsClient, path: string): Promise<string | null> {
  try {
    return await readText(fs, path)
  } catch {
    return null
  }
}

export async function writeText(fs: FsClient, path: string, content: string): Promise<void> {
  await fs.promises.writeFile(path, toBytes(content))
}

export async function mkdirp(fs: FsClient, path: string): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  let cur = ''
  for (const part of parts) {
    cur += '/' + part
    if (!(await exists(fs, cur))) {
      try {
        await fs.promises.mkdir(cur)
      } catch (e) {
        if (!(await exists(fs, cur))) throw e
      }
    }
  }
}

/** Write a file, creating parent directories as needed. */
export async function writeFileDeep(fs: FsClient, path: string, content: string | Uint8Array): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf('/'))
  if (dir) await mkdirp(fs, dir)
  await fs.promises.writeFile(path, toBytes(content))
}

export async function rmrf(fs: FsClient, path: string): Promise<void> {
  let st
  try {
    st = await fs.promises.lstat(path)
  } catch {
    return
  }
  if (st.isDirectory()) {
    for (const name of await fs.promises.readdir(path)) await rmrf(fs, join(path, name))
    await fs.promises.rmdir(path)
  } else {
    await fs.promises.unlink(path)
  }
}

export async function copyFile(fs: FsClient, from: string, to: string): Promise<void> {
  const data = await fs.promises.readFile(from)
  await writeFileDeep(fs, to, data as Uint8Array)
}

/** Recursively list files under `root` (absolute paths). Skips `.git` when `skipGit`. */
export async function listFilesRecursive(fs: FsClient, root: string, skipGit = true): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    let names: string[]
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      return
    }
    for (const name of names.sort()) {
      if (skipGit && name === '.git') continue
      const full = join(dir, name)
      const st = await fs.promises.lstat(full)
      if (st.isDirectory()) await walk(full)
      else out.push(full)
    }
  }
  await walk(root)
  return out
}

export type Snapshot = Map<string, Uint8Array | null> // null = directory

/** Capture a full copy of a directory tree (used for "Undo last step" and tests). */
export async function snapshot(fs: FsClient, root: string): Promise<Snapshot> {
  const snap: Snapshot = new Map()
  async function walk(dir: string) {
    let names: string[]
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      return
    }
    for (const name of names) {
      const full = join(dir, name)
      const st = await fs.promises.lstat(full)
      if (st.isDirectory()) {
        snap.set(full, null)
        await walk(full)
      } else {
        snap.set(full, toBytes(await fs.promises.readFile(full)))
      }
    }
  }
  if (await exists(fs, root)) {
    snap.set(root, null)
    await walk(root)
  }
  return snap
}

export async function restore(fs: FsClient, root: string, snap: Snapshot): Promise<void> {
  await rmrf(fs, root)
  const entries = [...snap.entries()].sort((a, b) => a[0].length - b[0].length)
  for (const [path, data] of entries) {
    if (data === null) await mkdirp(fs, path)
    else await writeFileDeep(fs, path, data)
  }
}

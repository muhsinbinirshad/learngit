import git, { TREE, STAGE, type TreeEntry, type WalkerEntry } from 'isomorphic-git'
import type { Repo } from './repo'
import { EMPTY_TREE } from './repo'

export interface FlatEntry {
  oid: string
  mode: string // '100644' | '100755' | '120000'
}
export type FlatTree = Map<string, FlatEntry>

function modeString(mode: number): string {
  return mode.toString(8).padStart(6, '0')
}

/** Read a commit's (or tree's) tree as a flat path -> {oid, mode} map. */
export async function readFlatTree(repo: Repo, oid: string | null): Promise<FlatTree> {
  const out: FlatTree = new Map()
  if (!oid) return out
  await git.walk({
    fs: repo.fs,
    dir: repo.dir,
    gitdir: repo.gitdir,
    cache: repo.cache,
    trees: [TREE({ ref: oid })],
    map: async (filepath: string, [entry]: Array<WalkerEntry | null>) => {
      if (!entry || filepath === '.') return
      const type = await entry.type()
      if (type === 'blob') out.set(filepath, { oid: await entry.oid(), mode: modeString(await entry.mode()) })
    },
  })
  return out
}

/** Read the index (staging area) as a flat map. */
export async function readIndex(repo: Repo): Promise<FlatTree> {
  const out: FlatTree = new Map()
  await git.walk({
    fs: repo.fs,
    dir: repo.dir,
    gitdir: repo.gitdir,
    cache: repo.cache,
    trees: [STAGE()],
    map: async (filepath: string, [entry]: Array<WalkerEntry | null>) => {
      if (!entry || filepath === '.') return
      const type = await entry.type()
      if (type === 'blob') out.set(filepath, { oid: await entry.oid(), mode: modeString(await entry.mode()) })
    },
  })
  return out
}

interface Node {
  files: Map<string, FlatEntry>
  dirs: Map<string, Node>
}

/** Write a flat map as nested tree objects; returns the root tree oid. */
export async function writeFlatTree(repo: Repo, flat: FlatTree): Promise<string> {
  if (flat.size === 0) {
    return git.writeTree({ fs: repo.fs, gitdir: repo.gitdir, tree: [] })
  }
  const root: Node = { files: new Map(), dirs: new Map() }
  for (const [path, entry] of flat) {
    const parts = path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const d = parts[i]!
      if (!node.dirs.has(d)) node.dirs.set(d, { files: new Map(), dirs: new Map() })
      node = node.dirs.get(d)!
    }
    node.files.set(parts[parts.length - 1]!, entry)
  }
  async function write(node: Node): Promise<string> {
    const entries: TreeEntry[] = []
    for (const [name, sub] of node.dirs) {
      entries.push({ mode: '040000', path: name, oid: await write(sub), type: 'tree' })
    }
    for (const [name, e] of node.files) {
      entries.push({ mode: e.mode, path: name, oid: e.oid, type: 'blob' })
    }
    return git.writeTree({ fs: repo.fs, gitdir: repo.gitdir, tree: entries })
  }
  return write(root)
}

export async function commitTreeOid(repo: Repo, commitOid: string | null): Promise<string> {
  if (!commitOid) return EMPTY_TREE
  const { commit } = await repo.readCommit(commitOid)
  return commit.tree
}

export async function readFileAtCommit(repo: Repo, commitOid: string, path: string): Promise<string | null> {
  const tree = await readFlatTree(repo, commitOid)
  const e = tree.get(path)
  return e ? repo.readBlobText(e.oid) : null
}

/** Paths whose entries differ between two flat trees. */
export function diffFlatTrees(a: FlatTree, b: FlatTree): { added: string[]; modified: string[]; deleted: string[] } {
  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []
  for (const [p, e] of b) {
    const ae = a.get(p)
    if (!ae) added.push(p)
    else if (ae.oid !== e.oid || ae.mode !== e.mode) modified.push(p)
  }
  for (const p of a.keys()) if (!b.has(p)) deleted.push(p)
  return { added: added.sort(), modified: modified.sort(), deleted: deleted.sort() }
}

import type { ReadCommitResult } from 'isomorphic-git'
import type { Repo } from './repo'

export interface CommitNode {
  oid: string
  parents: string[]
  message: string
  author: { name: string; email: string; timestamp: number }
  committer: { name: string; email: string; timestamp: number }
  tree: string
}

export function toNode(r: ReadCommitResult): CommitNode {
  return {
    oid: r.oid,
    parents: r.commit.parent,
    message: r.commit.message,
    author: { name: r.commit.author.name, email: r.commit.author.email, timestamp: r.commit.author.timestamp },
    committer: { name: r.commit.committer.name, email: r.commit.committer.email, timestamp: r.commit.committer.timestamp },
    tree: r.commit.tree,
  }
}

/** All commits reachable from `include` and not from `exclude`, newest first in topological order. */
export async function revList(
  repo: Repo,
  include: string[],
  exclude: string[] = [],
  opts: { firstParent?: boolean; limit?: number } = {},
): Promise<CommitNode[]> {
  const excluded = new Set<string>()
  const stack = [...exclude]
  while (stack.length) {
    const oid = stack.pop()!
    if (excluded.has(oid)) continue
    excluded.add(oid)
    const c = await repo.readCommitSafe(oid)
    if (c) stack.push(...c.commit.parent)
  }
  const nodes = new Map<string, CommitNode>()
  const queue = [...include]
  while (queue.length) {
    const oid = queue.shift()!
    if (nodes.has(oid) || excluded.has(oid)) continue
    const c = await repo.readCommitSafe(oid)
    if (!c) continue
    const node = toNode(c)
    nodes.set(oid, node)
    const parents = opts.firstParent ? node.parents.slice(0, 1) : node.parents
    queue.push(...parents)
  }
  const sorted = topoSort(nodes)
  return opts.limit ? sorted.slice(0, opts.limit) : sorted
}

/** Topological order (children before parents), ties broken by committer time, newest first. */
export function topoSort(nodes: Map<string, CommitNode>): CommitNode[] {
  const childCount = new Map<string, number>()
  for (const n of nodes.values()) {
    for (const p of n.parents) if (nodes.has(p)) childCount.set(p, (childCount.get(p) ?? 0) + 1)
  }
  const ready = [...nodes.values()].filter((n) => !childCount.get(n.oid))
  const out: CommitNode[] = []
  const byTime = (a: CommitNode, b: CommitNode) => b.committer.timestamp - a.committer.timestamp || a.oid.localeCompare(b.oid)
  while (ready.length) {
    ready.sort(byTime)
    const n = ready.shift()!
    out.push(n)
    for (const p of n.parents) {
      if (!nodes.has(p)) continue
      const c = (childCount.get(p) ?? 0) - 1
      childCount.set(p, c)
      if (c === 0) ready.push(nodes.get(p)!)
    }
  }
  return out
}

export interface BlameLine {
  lineNo: number
  oid: string
  author: string
  timestamp: number
  text: string
}

/** Line-by-line attribution following first parents. Adequate for lab-sized histories. */
export async function blame(repo: Repo, path: string, rev = 'HEAD'): Promise<BlameLine[]> {
  const { diffLines } = await import('diff')
  const { readFileAtCommit } = await import('./tree')
  const startOid = await repo.resolveRevision(rev)
  const content = await readFileAtCommit(repo, startOid, path)
  if (content === null) throw (await import('./errors')).fatal(`no such path '${path}' in ${rev}`)
  const lines = content.replace(/\n$/, '').split('\n')
  const attr: (string | null)[] = lines.map(() => null)
  // mapping[i] = index of original line i in `current` content
  let mapping: (number | null)[] = lines.map((_, i) => i)
  let current = startOid
  let currentText = content
  // guard against infinite loops
  for (let steps = 0; steps < 10000; steps++) {
    const c = await repo.readCommit(current)
    const parent = c.commit.parent[0]
    const parentText = parent ? await readFileAtCommit(repo, parent, path) : null
    if (parentText === null) {
      for (let i = 0; i < attr.length; i++) if (attr[i] === null && mapping[i] !== null) attr[i] = current
      break
    }
    if (parentText === currentText) {
      current = parent!
      continue
    }
    // Build map from current line index -> parent line index (or null if added in `current`).
    const parts = diffLines(parentText, currentText)
    const curToParent: (number | null)[] = []
    let pi = 0
    for (const part of parts) {
      const n = part.count ?? 0
      if (part.added) {
        for (let k = 0; k < n; k++) curToParent.push(null)
      } else if (part.removed) {
        pi += n
      } else {
        for (let k = 0; k < n; k++) curToParent.push(pi++)
      }
    }
    const next: (number | null)[] = mapping.map(() => null)
    for (let i = 0; i < attr.length; i++) {
      if (attr[i] !== null) continue
      const ci = mapping[i]
      if (ci === null || ci === undefined) continue
      const target = curToParent[ci]
      if (target === null || target === undefined) attr[i] = current
      else next[i] = target
    }
    mapping = next
    if (attr.every((a) => a !== null)) break
    current = parent!
    currentText = parentText
  }
  const out: BlameLine[] = []
  const cache = new Map<string, ReadCommitResult>()
  for (let i = 0; i < lines.length; i++) {
    const oid = attr[i] ?? startOid
    if (!cache.has(oid)) cache.set(oid, await repo.readCommit(oid))
    const c = cache.get(oid)!
    out.push({ lineNo: i + 1, oid, author: c.commit.author.name, timestamp: c.commit.author.timestamp, text: lines[i]! })
  }
  return out
}

/** Commits that touched `path` (any parent), newest first. */
export async function logForPath(repo: Repo, startOid: string, path: string): Promise<CommitNode[]> {
  const { readFlatTree } = await import('./tree')
  const all = await revList(repo, [startOid])
  const out: CommitNode[] = []
  for (const n of all) {
    const tree = await readFlatTree(repo, n.oid)
    const mine = tree.get(path)?.oid ?? null
    let changed = n.parents.length === 0 ? mine !== null : false
    for (const p of n.parents) {
      const pt = await readFlatTree(repo, p)
      if ((pt.get(path)?.oid ?? null) !== mine) changed = true
    }
    if (changed) out.push(n)
  }
  return out
}

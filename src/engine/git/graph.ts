/**
 * Graph model consumed by the visualizer and by `git log --graph`.
 * Nodes are laid out newest-first with a lane per concurrent line of development.
 */
import type { Repo, RefInfo } from './repo'
import { revList, type CommitNode } from './history'

export interface GraphRef {
  name: string
  kind: RefInfo['kind'] | 'HEAD'
  isHead?: boolean
}

export interface GraphNode extends CommitNode {
  row: number
  lane: number
  refs: GraphRef[]
  isHead: boolean
}

export interface GraphEdge {
  from: string // child
  to: string // parent
  fromLane: number
  toLane: number
  fromRow: number
  toRow: number
  /** Edge to a parent outside the rendered set (e.g. depth-limited). */
  dangling?: boolean
}

export interface GraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
  laneCount: number
  head: { oid: string | null; branch: string | null; detached: boolean }
  refs: RefInfo[]
  state: {
    merging: boolean
    rebasing: boolean
    cherryPicking: boolean
    reverting: boolean
    bisecting: boolean
    conflicts: string[]
  }
}

export async function buildGraphModel(repo: Repo, opts: { limit?: number } = {}): Promise<GraphModel> {
  const refs = await repo.listAllRefs()
  const headOid = await repo.headOid()
  const branch = await repo.currentBranch()
  const roots = new Set<string>(refs.map((r) => r.oid))
  if (headOid) roots.add(headOid)
  const rb = await repo.getRebaseState()
  if (rb) {
    roots.add(rb.origHead)
    for (const t of rb.todo) roots.add(t.oid)
  }
  const mergeHead = await repo.getMergeHead()
  if (mergeHead) roots.add(mergeHead)
  const commits = await revList(repo, [...roots], [], { limit: opts.limit })
  const laid = layoutLanes(commits)

  const refsByOid = new Map<string, GraphRef[]>()
  for (const r of refs) {
    if (!refsByOid.has(r.oid)) refsByOid.set(r.oid, [])
    refsByOid.get(r.oid)!.push({ name: r.short, kind: r.kind, isHead: r.kind === 'branch' && r.short === branch })
  }
  if (headOid && !branch) {
    if (!refsByOid.has(headOid)) refsByOid.set(headOid, [])
    refsByOid.get(headOid)!.unshift({ name: 'HEAD', kind: 'HEAD', isHead: true })
  }

  const nodes: GraphNode[] = laid.nodes.map((n) => ({
    ...n.commit,
    row: n.row,
    lane: n.lane,
    refs: (refsByOid.get(n.commit.oid) ?? []).sort((a, b) => Number(!!b.isHead) - Number(!!a.isHead)),
    isHead: n.commit.oid === headOid,
  }))
  const state = await repo.state()
  return {
    nodes,
    edges: laid.edges,
    laneCount: laid.laneCount,
    head: { oid: headOid, branch, detached: !!headOid && !branch },
    refs,
    state: {
      merging: !!state.mergeHead,
      rebasing: !!state.rebase,
      cherryPicking: !!state.cherryPickHead,
      reverting: !!state.revertHead,
      bisecting: !!state.bisect,
      conflicts: state.conflicts,
    },
  }
}

export interface LaidNode {
  commit: CommitNode
  row: number
  lane: number
}

/**
 * Assign lanes to commits already in topological order (children first).
 * A commit reuses the lane reserved for it by its first child; parents reserve lanes below.
 */
export function layoutLanes(commits: CommitNode[]): { nodes: LaidNode[]; edges: GraphEdge[]; laneCount: number } {
  const lanes: (string | null)[] = [] // lanes[i] = oid expected to appear next in lane i
  const laneOf = new Map<string, number>()
  const rowOf = new Map<string, number>()
  const nodes: LaidNode[] = []
  const edges: GraphEdge[] = []
  const inSet = new Set(commits.map((c) => c.oid))
  let laneCount = 0

  const findFree = () => {
    const i = lanes.indexOf(null)
    if (i >= 0) return i
    lanes.push(null)
    return lanes.length - 1
  }

  commits.forEach((c, row) => {
    let lane = lanes.indexOf(c.oid)
    if (lane < 0) {
      lane = findFree()
      lanes[lane] = c.oid
    }
    laneOf.set(c.oid, lane)
    rowOf.set(c.oid, row)
    nodes.push({ commit: c, row, lane })
    laneCount = Math.max(laneCount, lanes.length)

    // Reserve lanes for parents.
    lanes[lane] = null
    c.parents.forEach((p, idx) => {
      if (!inSet.has(p)) {
        edges.push({ from: c.oid, to: p, fromLane: lane, toLane: lane, fromRow: row, toRow: row + 1, dangling: true })
        return
      }
      let pl = lanes.indexOf(p)
      if (pl < 0) {
        if (idx === 0 && lanes[lane] === null) pl = lane
        else pl = findFree()
        lanes[pl] = p
      }
      edges.push({ from: c.oid, to: p, fromLane: lane, toLane: pl, fromRow: row, toRow: -1 })
    })
    // Compact trailing empty lanes.
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
    laneCount = Math.max(laneCount, lanes.length)
  })
  for (const e of edges) if (!e.dangling) e.toRow = rowOf.get(e.to) ?? e.fromRow + 1
  return { nodes, edges, laneCount: Math.max(1, laneCount) }
}

/** ASCII rendering for `git log --graph`. `render` returns the text lines for one commit. */
export function renderAsciiGraph(commits: CommitNode[], render: (c: CommitNode) => string[]): string[] {
  const { nodes, edges } = layoutLanes(commits)
  const out: string[] = []
  const spanning = (gapAfterRow: number) => edges.filter((e) => e.fromRow <= gapAfterRow && (e.dangling ? e.fromRow === gapAfterRow : e.toRow > gapAfterRow))

  nodes.forEach((n, i) => {
    // Lanes occupied at this row by edges passing through (started above, end below).
    const passing = new Set<number>()
    for (const e of edges) if (e.fromRow < i && (e.dangling ? false : e.toRow > i)) passing.add(e.toLane)
    const below = spanning(i)
    const width = Math.max(n.lane, ...passing, ...below.map((e) => Math.max(e.fromLane, e.toLane))) + 1
    const cells: string[] = Array.from({ length: width }, (_, l) => (l === n.lane ? '*' : passing.has(l) ? '|' : ' '))
    const lines = render(n.commit)
    out.push(`${cells.join(' ')} ${lines[0] ?? ''}`.trimEnd())
    const cont = cells.map((c) => (c === '*' ? '|' : c)).join(' ')
    for (const extra of lines.slice(1)) out.push(`${cont} ${extra}`.trimEnd())

    if (i === nodes.length - 1) return
    // Connector row between this commit and the next when any edge changes lane here.
    const diagonals = below.filter((e) => e.fromRow === i && e.toLane !== e.fromLane && !e.dangling)
    if (!diagonals.length) return
    const w = 2 * width
    const row: string[] = Array.from({ length: w }, () => ' ')
    for (const e of below) {
      if (e.fromRow === i && e.toLane !== e.fromLane) continue
      row[2 * e.toLane] = '|'
    }
    for (const e of diagonals) {
      if (e.toLane > e.fromLane) row[2 * e.toLane - 1] = '\\'
      else row[2 * e.toLane + 1] = '/'
    }
    out.push(row.join('').trimEnd())
  })
  return out
}

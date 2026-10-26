import { useMemo } from 'react'
import type { GraphModel, GraphRef } from '@/engine/git/graph'
import { cn } from '@/design-system/cn'

const LANE_W = 20
const ROW_H = 32
const PAD_X = 14
import { laneColor } from './lanes'

interface Props {
  model: GraphModel
  selected: string | null
  onSelect: (oid: string | null) => void
  compact?: boolean
}

/** Commit DAG: SVG lanes/edges on the left, HTML rows with refs and messages on the right. */
export function CommitGraph({ model, selected, onSelect, compact }: Props) {
  const width = PAD_X * 2 + Math.max(1, model.laneCount) * LANE_W
  const height = Math.max(1, model.nodes.length) * ROW_H
  const nodeByOid = useMemo(() => new Map(model.nodes.map((n) => [n.oid, n])), [model.nodes])

  const x = (lane: number) => PAD_X + lane * LANE_W + LANE_W / 2
  const y = (row: number) => row * ROW_H + ROW_H / 2

  return (
    <div className="relative flex min-w-0" role="list" aria-label="Commit graph">
      <svg width={width} height={height} className="shrink-0" aria-hidden>
        {model.edges.map((e, i) => {
          const child = nodeByOid.get(e.from)
          if (!child) return null
          const x1 = x(e.fromLane)
          const y1 = y(e.fromRow)
          const x2 = x(e.toLane)
          const y2 = e.dangling ? y(e.fromRow) + ROW_H * 0.8 : y(e.toRow)
          const color = laneColor(e.toLane)
          if (e.dangling) {
            return <line key={i} x1={x1} y1={y1} x2={x1} y2={y2} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
          }
          if (x1 === x2) return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} />
          // Bend right after the child so the parent's lane is reached before its row.
          const midY = y1 + ROW_H / 2
          const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${Math.min(y2, y1 + ROW_H)} L ${x2} ${y2}`
          return <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.5} />
        })}
        {model.nodes.map((n) => (
          <g
            key={n.oid}
            style={{ transform: `translate(${x(n.lane)}px, ${y(n.row)}px)`, transition: 'transform var(--duration-slow) var(--ease-standard)' }}
            className="animate-fade-in"
          >
            {n.isHead && <circle r={9} fill="none" stroke={laneColor(n.lane)} strokeWidth={1.5} opacity={0.5} />}
            <circle
              r={n.parents.length > 1 ? 6 : 5}
              fill={selected === n.oid ? laneColor(n.lane) : 'var(--color-background)'}
              stroke={laneColor(n.lane)}
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <ol className="min-w-0 flex-1">
        {model.nodes.map((n) => (
          <li key={n.oid} style={{ height: ROW_H }} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(selected === n.oid ? null : n.oid)}
              aria-pressed={selected === n.oid}
              aria-label={`Commit ${n.oid.slice(0, 7)}: ${n.message.split('\n')[0]}`}
              className={cn(
                'flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left transition-standard hover:bg-surface-variant',
                selected === n.oid && 'bg-primary-container hover:bg-primary-container',
              )}
            >
              {!compact && <code className="shrink-0 font-mono text-[11px] text-on-surface-variant">{n.oid.slice(0, 7)}</code>}
              <span className="flex max-w-[60%] shrink-0 items-center gap-1 overflow-hidden">
                {n.refs.map((r) => (
                  <RefChip key={`${r.kind}-${r.name}`} ref_={r} />
                ))}
              </span>
              <span className={cn('truncate text-xs', n.isHead ? 'font-medium text-on-surface' : 'text-on-surface')}>{n.message.split('\n')[0]}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function RefChip({ ref_ }: { ref_: GraphRef }) {
  const styles: Record<string, string> = {
    HEAD: 'bg-on-surface text-background',
    branch: ref_.isHead ? 'bg-primary text-on-primary' : 'bg-primary-container text-on-primary-container',
    tag: 'bg-warning-container text-on-warning-container',
    remote: 'bg-error-container text-on-error-container',
    stash: 'bg-surface-variant text-on-surface-variant',
  }
  const prefix = ref_.kind === 'tag' ? 'tag: ' : ''
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-40 shrink-0 items-center gap-1 truncate rounded-sm px-1.5 font-mono text-[11px] font-medium',
        styles[ref_.kind] ?? styles.branch,
      )}
      title={ref_.kind === 'branch' && ref_.isHead ? `HEAD -> ${ref_.name}` : ref_.name}
    >
      {ref_.kind === 'branch' && ref_.isHead && <span aria-label="HEAD">HEAD →</span>}
      {prefix}
      {ref_.name}
    </span>
  )
}

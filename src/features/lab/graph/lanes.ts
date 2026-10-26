const LANE_COLORS = [
  'var(--color-graph-lane-1)',
  'var(--color-graph-lane-2)',
  'var(--color-graph-lane-3)',
  'var(--color-graph-lane-4)',
  'var(--color-graph-lane-5)',
  'var(--color-graph-lane-6)',
]

/** Functional lane palette for the commit graph (cycles after six concurrent lanes). */
export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length]!
}

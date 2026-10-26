import { cn } from '@/design-system/cn'

/**
 * Flat "book cover" illustration per track: one muted colour, one ink colour, a small Git motif.
 * Decorative by default (aria-hidden); pass `title` to expose it as an image.
 */
export const COVERS: Record<string, { bg: string; ink: string; accent: string; label: string }> = {
  'before-you-start': { bg: '#F1E6D3', ink: '#5A3E1B', accent: '#D4A86A', label: 'Before you start' },
  foundations: { bg: '#D7E8CF', ink: '#1E4D2B', accent: '#8FBF7F', label: 'Foundations' },
  'branching-merging': { bg: '#D3E2F7', ink: '#173F78', accent: '#7FA7E6', label: 'Branching' },
  'remotes-collaboration': { bg: '#F7DFC8', ink: '#7A3A10', accent: '#E8A16E', label: 'Remotes' },
  'rewriting-history': { bg: '#F2E4B6', ink: '#6B4E00', accent: '#D9B64A', label: 'Rewriting' },
  recovery: { bg: '#F5D5D5', ink: '#8A1F1F', accent: '#E58A8A', label: 'Recovery' },
  'team-workflows': { bg: '#CFE8E5', ink: '#0B5A55', accent: '#6FC2BB', label: 'Workflows' },
  capstones: { bg: '#E3E5E8', ink: '#202124', accent: '#9AA0A6', label: 'Capstones' },
}

const SIZES = { sm: { w: 56, h: 76 }, md: { w: 84, h: 114 }, lg: { w: 132, h: 180 } }

export function TrackCover({
  trackId,
  size = 'md',
  title,
  className,
  muted,
}: {
  trackId: string
  size?: keyof typeof SIZES
  title?: string
  className?: string
  muted?: boolean
}) {
  const c = COVERS[trackId] ?? COVERS.capstones!
  const { w, h } = SIZES[size]
  const ink = muted ? '#5F6368' : c.ink
  const bg = muted ? '#E8EAED' : c.bg
  const accent = muted ? '#BDC1C6' : c.accent
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 84 114"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('shrink-0 rounded-[6px] shadow-1', className)}
    >
      <rect width="84" height="114" rx="6" fill={bg} />
      <rect x="4" y="4" width="76" height="106" rx="4" fill="none" stroke={ink} strokeOpacity="0.35" strokeWidth="1" />
      <rect x="0" y="0" width="7" height="114" rx="3" fill={ink} fillOpacity="0.18" />
      <g stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round">
        <Motif id={trackId} ink={ink} accent={accent} />
      </g>
      {size !== 'sm' && (
        <text x="14" y="98" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fontWeight="500" fill={ink} letterSpacing="0.3">
          {splitLabel(c.label).map((part, i) => (
            <tspan key={part} x="14" dy={i === 0 ? 0 : 9}>
              {part}
            </tspan>
          ))}
        </text>
      )}
    </svg>
  )
}

/** Break long labels onto two lines at the middle space so they fit the 84px cover. */
function splitLabel(label: string): string[] {
  if (label.length <= 12) return [label]
  const words = label.split(' ')
  let best = 1
  for (let i = 1; i < words.length; i++)
    if (
      Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length) <
      Math.abs(words.slice(0, best).join(' ').length - words.slice(best).join(' ').length)
    )
      best = i
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}

function Node({ x, y, fill }: { x: number; y: number; fill: string }) {
  return <circle cx={x} cy={y} r="4" fill={fill} stroke="none" />
}

function Motif({ id, ink, accent }: { id: string; ink: string; accent: string }) {
  switch (id) {
    case 'foundations':
      return (
        <>
          <path d="M42 22v48" />
          <Node x={42} y={24} fill={ink} />
          <Node x={42} y={46} fill={accent} />
          <Node x={42} y={68} fill={ink} />
        </>
      )
    case 'branching-merging':
      return (
        <>
          <path d="M34 22v48" />
          <path d="M34 36c0 10 18 6 18 16v4" />
          <path d="M52 56c0 8-18 6-18 14" />
          <Node x={34} y={24} fill={ink} />
          <Node x={52} y={52} fill={accent} />
          <Node x={34} y={70} fill={ink} />
        </>
      )
    case 'remotes-collaboration':
      return (
        <>
          <path d="M30 24v44M56 24v44" />
          <path d="M34 36h18m-5-5 5 5-5 5" />
          <path d="M52 56H34m5-5-5 5 5 5" />
          <Node x={30} y={24} fill={ink} />
          <Node x={56} y={24} fill={accent} />
          <Node x={30} y={68} fill={accent} />
          <Node x={56} y={68} fill={ink} />
        </>
      )
    case 'rewriting-history':
      return (
        <>
          <path d="M42 22v48" strokeDasharray="4 4" />
          <path d="M26 46h32" />
          <Node x={42} y={24} fill={ink} />
          <Node x={42} y={46} fill={accent} />
          <Node x={42} y={68} fill={ink} />
          <path d="M54 30l6 6-6 6" />
        </>
      )
    case 'recovery':
      return (
        <>
          <path d="M42 24v28" />
          <path d="M42 52a12 12 0 1 0 12 12" />
          <path d="M50 58l4 6 6-4" />
          <Node x={42} y={24} fill={ink} />
          <Node x={42} y={52} fill={accent} />
        </>
      )
    case 'team-workflows':
      return (
        <>
          <path d="M28 24v44M42 24v44M56 24v44" />
          <Node x={28} y={30} fill={ink} />
          <Node x={42} y={46} fill={accent} />
          <Node x={56} y={38} fill={ink} />
          <Node x={42} y={62} fill={ink} />
        </>
      )
    case 'before-you-start':
      return (
        <>
          <path d="M26 26h32v40H26z" fill={accent} fillOpacity="0.35" />
          <path d="M32 36h20M32 44h20M32 52h12" />
        </>
      )
    default:
      return (
        <>
          <path d="M30 70V24h22l-6 8 6 8H30" fill={accent} stroke={ink} />
          <Node x={30} y={70} fill={ink} />
        </>
      )
  }
}

import { cn } from '../cn'

export interface CircularProgressProps {
  /** 0..1; omit for indeterminate. */
  value?: number
  size?: number
  label: string
  className?: string
}

export function CircularProgress({ value, size = 32, label, className }: CircularProgressProps) {
  const stroke = 3
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const determinate = typeof value === 'number'
  const dash = determinate ? c * Math.max(0, Math.min(1, value)) : c * 0.3
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      className={cn(!determinate && 'animate-[spin_1.2s_linear_infinite]', className)}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-variant)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={determinate && value >= 1 ? 'var(--color-success)' : 'var(--color-primary)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray var(--duration-slow) var(--ease-standard)' }}
      />
    </svg>
  )
}

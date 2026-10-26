import { cn } from '../cn'

export function ProgressBar({
  value,
  max,
  label,
  size = 'sm',
  className,
}: {
  value: number
  max: number
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} of ${max}`}
      className={cn('w-full overflow-hidden rounded-full bg-surface-variant', size === 'sm' ? 'h-1' : 'h-2', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-slow ease-standard', pct === 100 ? 'bg-success' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

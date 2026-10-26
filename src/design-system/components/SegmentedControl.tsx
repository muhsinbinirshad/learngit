import { cn } from '../cn'
import { Icon } from './Icon'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'sm',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-md border border-outline bg-background p-0.5">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm font-medium transition-standard',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              selected ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
            )}
          >
            {o.icon && <Icon name={o.icon} size={16} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

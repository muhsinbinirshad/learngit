import { useId } from 'react'
import { cn } from '../cn'

export interface SwitchProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/** Material-style switch built on a button with role="switch". */
export function Switch({ label, description, checked, onChange, disabled, className }: SwitchProps) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <span className="min-w-0">
        <span id={`${id}-label`} className={cn('block text-sm', disabled ? 'text-on-surface-variant' : 'text-on-surface')}>
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="block text-xs text-on-surface-variant">
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full border transition-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'border-primary bg-primary' : 'border-on-surface-variant bg-surface-variant hover:border-on-surface',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-1 transition-[left,background-color] duration-fast ease-standard',
            checked ? 'left-[20px] bg-on-primary' : 'left-[3px] bg-on-surface-variant',
          )}
        />
      </button>
    </div>
  )
}

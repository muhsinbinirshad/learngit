import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string
  options: SelectOption[]
  hint?: string
  error?: string
  hideLabel?: boolean
  placeholder?: string
}

/** Native select styled to the token set: reliable keyboard and screen-reader behaviour for free. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, error, hideLabel, placeholder, className, id, disabled, ...rest },
  ref,
) {
  const auto = useId()
  const selectId = id ?? auto
  const hintId = `${selectId}-hint`
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={selectId} className={cn('text-xs font-medium text-on-surface-variant', hideLabel && 'sr-only')}>
        {label}
      </label>
      <span className="relative">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={hint || error ? hintId : undefined}
          className={cn(
            'h-9 w-full appearance-none rounded-md border bg-background pl-3 pr-9 text-sm text-on-surface transition-standard hover:border-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface disabled:text-on-surface-variant',
            error ? 'border-error' : 'border-outline',
          )}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="expand_more" size={20} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
      </span>
      {(error || hint) && (
        <p id={hintId} className={cn('text-xs', error ? 'text-error' : 'text-on-surface-variant')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
})

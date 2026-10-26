import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  description?: string
  indeterminate?: boolean
  error?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate, error, className, id, disabled, checked, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <label htmlFor={inputId} className={cn('group flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', className)}>
      <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          ref={(el) => {
            if (el) el.indeterminate = !!indeterminate
            if (typeof ref === 'function') ref(el)
            else if (ref) ref.current = el
          }}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          checked={checked}
          aria-invalid={!!error || undefined}
          aria-describedby={description || error ? `${inputId}-desc` : undefined}
          className="peer absolute inset-0 h-full w-full cursor-[inherit] appearance-none rounded-sm border-2 border-on-surface-variant bg-background transition-standard checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary group-hover:border-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          {...rest}
        />
        <Icon
          name={indeterminate ? 'remove' : 'check'}
          size={16}
          className="pointer-events-none relative text-on-primary opacity-0 transition-standard peer-checked:opacity-100 peer-indeterminate:opacity-100"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-on-surface">{label}</span>
        {(description || error) && (
          <span id={`${inputId}-desc`} className={cn('block text-xs', error ? 'text-error' : 'text-on-surface-variant')}>
            {error ?? description}
          </span>
        )}
      </span>
    </label>
  )
})

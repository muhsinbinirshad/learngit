import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../cn'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  hideLabel?: boolean
}

const inputBase =
  'w-full rounded-md border bg-background px-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-standard ' +
  'hover:border-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-surface disabled:text-on-surface-variant disabled:cursor-not-allowed'

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, hideLabel, className, id, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const hintId = `${inputId}-hint`
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={inputId} className={cn('text-xs font-medium text-on-surface-variant', hideLabel && 'sr-only')}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={hint || error ? hintId : undefined}
        className={cn(inputBase, 'h-9', error ? 'border-error' : 'border-outline')}
        {...rest}
      />
      {(error || hint) && (
        <p id={hintId} className={cn('text-xs', error ? 'text-error' : 'text-on-surface-variant')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
})

export const TextArea = forwardRef<HTMLTextAreaElement, FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, hint, error, hideLabel, className, id, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const hintId = `${inputId}-hint`
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={inputId} className={cn('text-xs font-medium text-on-surface-variant', hideLabel && 'sr-only')}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={hint || error ? hintId : undefined}
        className={cn(inputBase, 'min-h-[72px] py-2 font-mono text-xs leading-5', error ? 'border-error' : 'border-outline')}
        {...rest}
      />
      {(error || hint) && (
        <p id={hintId} className={cn('text-xs', error ? 'text-error' : 'text-on-surface-variant')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
})

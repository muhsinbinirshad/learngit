import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'
import { Tooltip } from './Tooltip'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string
  /** Required: icon-only buttons must have an accessible name. Also shown as tooltip. */
  label: string
  size?: 'sm' | 'md'
  variant?: 'standard' | 'tonal' | 'outlined'
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', variant = 'standard', active, className, type = 'button', ...rest },
  ref,
) {
  const dims = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const look =
    variant === 'tonal'
      ? 'bg-primary-container text-on-primary-container hover:bg-[#d2e3fc]'
      : variant === 'outlined'
        ? 'border border-outline text-on-surface-variant hover:bg-surface-variant'
        : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
  return (
    <Tooltip content={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-standard disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
          dims,
          look,
          active && 'bg-primary-container text-on-primary-container',
          className,
        )}
        {...rest}
      >
        <Icon name={icon} size={size === 'sm' ? 18 : 20} />
      </button>
    </Tooltip>
  )
})

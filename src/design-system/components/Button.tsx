import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'
import { Spinner } from './Spinner'

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: string
  trailingIcon?: string
  loading?: boolean
  children?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md select-none whitespace-nowrap transition-standard ' +
  'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none'

const variants: Record<ButtonVariant, string> = {
  filled: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active disabled:hover:bg-primary',
  tonal: 'bg-primary-container text-on-primary-container hover:bg-[#d2e3fc] active:bg-[#c2d8fa] disabled:hover:bg-primary-container',
  outlined: 'border border-outline text-primary bg-background hover:bg-primary-container/60 active:bg-primary-container disabled:hover:bg-background',
  text: 'text-primary hover:bg-primary-container/60 active:bg-primary-container disabled:hover:bg-transparent',
  danger: 'bg-error text-on-primary hover:bg-error-hover active:bg-[#b31412] disabled:hover:bg-error',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', size = 'md', icon, trailingIcon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
      {trailingIcon && !loading ? <Icon name={trailingIcon} size={size === 'sm' ? 16 : 18} /> : null}
    </button>
  )
})

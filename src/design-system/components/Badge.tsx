import type { ReactNode } from 'react'
import { cn } from '../cn'

export interface BadgeProps {
  /** Number or short text; omit for a dot badge. */
  content?: number | string
  max?: number
  tone?: 'primary' | 'error' | 'neutral'
  /** Accessible description, e.g. "3 unread". */
  label: string
  children?: ReactNode
  className?: string
}

/** Small status indicator anchored to a child (icon, avatar) or standalone. */
export function Badge({ content, max = 99, tone = 'primary', label, children, className }: BadgeProps) {
  const text = typeof content === 'number' && content > max ? `${max}+` : content
  const tones = { primary: 'bg-primary text-on-primary', error: 'bg-error text-on-primary', neutral: 'bg-on-surface-variant text-background' }
  const badge = (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-mono text-[10px] font-medium leading-none',
        tones[tone],
        text === undefined ? 'h-2 w-2' : 'h-4 min-w-4 px-1',
        children && 'absolute -right-1 -top-1',
        className,
      )}
    >
      {text}
    </span>
  )
  if (!children) return badge
  return (
    <span className="relative inline-flex">
      {children}
      {badge}
    </span>
  )
}

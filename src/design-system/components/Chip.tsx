import type { ReactNode } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'

export type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error'

const tones: Record<ChipTone, string> = {
  neutral: 'bg-surface-variant text-on-surface-variant',
  primary: 'bg-primary-container text-on-primary-container',
  success: 'bg-success-container text-on-success-container',
  warning: 'bg-warning-container text-on-warning-container',
  error: 'bg-error-container text-on-error-container',
}

export function Chip({
  tone = 'neutral',
  icon,
  children,
  className,
  mono,
}: {
  tone?: ChipTone
  icon?: string
  children: ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium',
        tones[tone],
        mono && 'font-mono',
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  )
}

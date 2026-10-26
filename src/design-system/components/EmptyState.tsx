import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { cn } from '../cn'

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
  className,
}: {
  icon: string
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 p-4' : 'gap-3 p-8', className)}>
      <span className={cn('flex items-center justify-center rounded-full bg-surface-variant text-on-surface-variant', compact ? 'h-9 w-9' : 'h-12 w-12')}>
        <Icon name={icon} size={compact ? 20 : 24} />
      </span>
      <div>
        <p className={cn('font-medium text-on-surface', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description && <p className={cn('mt-1 text-on-surface-variant', compact ? 'text-xs' : 'text-sm')}>{description}</p>}
      </div>
      {action}
    </div>
  )
}

import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean
  padded?: boolean
  children: ReactNode
}

export function Card({ elevated, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('rounded-lg border border-outline bg-background', elevated && 'shadow-1', padded && 'p-4', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-base font-medium text-on-surface">{title}</h3>
        {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

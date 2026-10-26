import type { ReactNode } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'

type Tone = 'info' | 'success' | 'warning' | 'error'
const styles: Record<Tone, { box: string; icon: string }> = {
  info: { box: 'bg-primary-container text-on-primary-container', icon: 'info' },
  success: { box: 'bg-success-container text-on-success-container', icon: 'check_circle' },
  warning: { box: 'bg-warning-container text-on-warning-container', icon: 'warning' },
  error: { box: 'bg-error-container text-on-error-container', icon: 'error' },
}

export function InlineMessage({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const s = styles[tone]
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-md px-3 py-2 text-sm', s.box, className)}
    >
      <Icon name={s.icon} size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

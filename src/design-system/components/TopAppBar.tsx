import type { ReactNode } from 'react'
import { cn } from '../cn'

interface TopAppBarProps {
  leading: ReactNode
  center?: ReactNode
  trailing?: ReactNode
  /** Constrain content to the reading width (dashboard pages) or stretch (workspaces). */
  contained?: boolean
  className?: string
}

/** Top app bar: 56px, single elevation level via border, sticky. */
export function TopAppBar({ leading, center, trailing, contained, className }: TopAppBarProps) {
  return (
    <header role="banner" className={cn('sticky top-0 z-20 border-b border-outline bg-background', className)}>
      <div className={cn('flex h-[var(--topbar-height)] items-center justify-between gap-4 px-4', contained && 'mx-auto w-full max-w-6xl px-6')}>
        <div className="flex min-w-0 items-center gap-6">{leading}</div>
        {center && <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">{center}</div>}
        <div className="flex shrink-0 items-center gap-3">{trailing}</div>
      </div>
    </header>
  )
}

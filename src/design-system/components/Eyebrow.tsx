import type { ReactNode } from 'react'
import { cn } from '../cn'

/** Small-caps mono label used as a section eyebrow throughout the learning pages. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-on-surface-variant', className)}>{children}</p>
}

import { cn } from '../cn'

export interface IconProps {
  name: string
  size?: 16 | 18 | 20 | 24
  filled?: boolean
  className?: string
  /** Decorative by default; pass a label when the icon carries meaning on its own. */
  label?: string
}

/** Material Symbols Outlined glyph. */
export function Icon({ name, size = 20, filled, className, label }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined', filled && 'icon-fill', className)}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size >= 24 ? 24 : 20}` }}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      data-icon={name}
    />
  )
}

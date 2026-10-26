export function Spinner({ size = 20, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <svg className="animate-[spin_0.9s_linear_infinite]" width={size} height={size} viewBox="0 0 24 24" role="status" aria-label={label}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

import { useEffect, useRef } from 'react'

const COLORS = ['#1A73E8', '#188038', '#F9AB00', '#8AB4F8', '#81C995', '#E8F0FE']

/**
 * A short, understated confetti burst for earned moments (lesson or lab complete).
 * Canvas only, ~1.6 s, no sound, no loop. Does nothing when the user prefers reduced motion.
 */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!fire) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion')
    if (reduce) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = (canvas.width = window.innerWidth * dpr)
    const h = (canvas.height = window.innerHeight * dpr)
    const count = 90
    const parts = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2
      const speed = (6 + Math.random() * 7) * dpr
      return {
        x: w / 2 + (Math.random() - 0.5) * 120 * dpr,
        y: h * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        size: (4 + Math.random() * 4) * dpr,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        shape: Math.random() < 0.7 ? 'rect' : 'dot',
      }
    })
    const start = performance.now()
    const duration = 1600
    let raf = 0
    const frame = (now: number) => {
      const t = (now - start) / duration
      ctx.clearRect(0, 0, w, h)
      if (t >= 1) {
        canvas.style.opacity = '0'
        return
      }
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      for (const p of parts) {
        p.vy += 0.28 * dpr
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    canvas.style.opacity = '1'
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [fire])
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full opacity-0 transition-opacity duration-base" />
}

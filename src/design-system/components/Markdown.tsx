import type { ReactNode } from 'react'
import { cn } from '../cn'

/**
 * Deliberately small renderer for lab copy: paragraphs, bullet lists, numbered lists,
 * `code`, **bold**. No raw HTML, no links to external sites. Enough for briefs and debriefs.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n\s*\n/)
  return (
    <div className={cn('prose-lab text-sm leading-6 text-on-surface', className)}>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*] /, ''))}</li>
              ))}
            </ul>
          )
        }
        if (lines.every((l) => /^\s*\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*\d+\. /, ''))}</li>
              ))}
            </ol>
          )
        }
        return <p key={i}>{inline(lines.join(' '))}</p>
      })}
    </div>
  )
}

export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

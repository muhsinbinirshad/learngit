/** Parse and resolve Git conflict blocks in text. Pure functions, unit-tested. */
export interface ConflictBlock {
  /** 0-based line indexes (inclusive start, exclusive end) of the whole block including markers. */
  start: number
  end: number
  oursLabel: string
  theirsLabel: string
  ours: string[]
  theirs: string[]
}

export function parseConflicts(text: string): ConflictBlock[] {
  const lines = text.split('\n')
  const blocks: ConflictBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.startsWith('<<<<<<<')) {
      const start = i
      const oursLabel = line.slice(7).trim()
      const ours: string[] = []
      const theirs: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('=======')) ours.push(lines[i++]!)
      i++ // skip =======
      let theirsLabel = ''
      while (i < lines.length && !lines[i]!.startsWith('>>>>>>>')) theirs.push(lines[i++]!)
      if (i < lines.length) {
        theirsLabel = lines[i]!.slice(7).trim()
        i++
      }
      blocks.push({ start, end: i, oursLabel, theirsLabel, ours, theirs })
      continue
    }
    i++
  }
  return blocks
}

export type Resolution = 'ours' | 'theirs' | 'both'

/** Replace one conflict block (by index) with the chosen side(s). */
export function resolveConflict(text: string, blockIndex: number, resolution: Resolution): string {
  const blocks = parseConflicts(text)
  const block = blocks[blockIndex]
  if (!block) return text
  const lines = text.split('\n')
  const replacement = resolution === 'ours' ? block.ours : resolution === 'theirs' ? block.theirs : [...block.ours, ...block.theirs]
  lines.splice(block.start, block.end - block.start, ...replacement)
  return lines.join('\n')
}

export function resolveAll(text: string, resolution: Resolution): string {
  let out = text
  while (parseConflicts(out).length) out = resolveConflict(out, 0, resolution)
  return out
}

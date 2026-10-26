import { describe, it, expect } from 'vitest'
import { parseConflicts, resolveConflict, resolveAll } from '../conflicts'

const text = [
  'a',
  '<<<<<<< HEAD',
  'ours1',
  'ours2',
  '=======',
  'theirs1',
  '>>>>>>> feature',
  'b',
  '<<<<<<< HEAD',
  'x',
  '=======',
  'y',
  '>>>>>>> feature',
  'c',
].join('\n')

describe('conflicts', () => {
  it('parses blocks with labels', () => {
    const blocks = parseConflicts(text)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ start: 1, end: 7, oursLabel: 'HEAD', theirsLabel: 'feature', ours: ['ours1', 'ours2'], theirs: ['theirs1'] })
  })
  it('resolves one block each way', () => {
    expect(resolveConflict(text, 0, 'ours').split('\n').slice(0, 4)).toEqual(['a', 'ours1', 'ours2', 'b'])
    expect(resolveConflict(text, 0, 'theirs').split('\n').slice(0, 3)).toEqual(['a', 'theirs1', 'b'])
    expect(resolveConflict(text, 1, 'both').split('\n').slice(-4)).toEqual(['b', 'x', 'y', 'c'])
  })
  it('resolves all blocks', () => {
    expect(resolveAll(text, 'theirs')).toBe(['a', 'theirs1', 'b', 'y', 'c'].join('\n'))
    expect(parseConflicts(resolveAll(text, 'both'))).toHaveLength(0)
  })
})

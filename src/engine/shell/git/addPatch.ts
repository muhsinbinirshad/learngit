import { structuredPatch } from 'diff'
import { readTextOrNull } from '../../fs'
import { fatal } from '../../git/errors'
import type { Repo } from '../../git/repo'
import { readIndex } from '../../git/tree'
import { computeStatus, stagePath } from '../../git/worktree'
import { ansi } from '../format'
import type { CommandContext, Interaction } from '../types'
import { expandPathspec } from './basics'

interface Hunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

interface FileJob {
  path: string
  indexText: string
  worktreeText: string
  hunks: Hunk[]
  accepted: boolean[]
}

function renderHunk(h: Hunk): string[] {
  const out = [ansi.cyan(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`)]
  for (const l of h.lines) out.push(l.startsWith('+') ? ansi.green(l) : l.startsWith('-') ? ansi.red(l) : l)
  return out
}

/** Apply the accepted hunks of a file onto its index content. */
function applyHunks(indexText: string, hunks: Hunk[], accepted: boolean[]): string {
  const oldLines = indexText.split('\n')
  const trailingNewline = indexText.endsWith('\n')
  if (trailingNewline) oldLines.pop()
  const out: string[] = []
  let cursor = 0 // index into oldLines
  hunks.forEach((h, i) => {
    const start = h.oldStart - 1
    while (cursor < start) out.push(oldLines[cursor++]!)
    if (accepted[i]) {
      for (const l of h.lines) {
        if (l.startsWith('+')) out.push(l.slice(1))
        else if (l.startsWith('-')) cursor++
        else if (l.startsWith(' ')) {
          out.push(l.slice(1))
          cursor++
        }
      }
    } else {
      // Keep the old side of the hunk.
      for (const l of h.lines) {
        if (l.startsWith('-') || l.startsWith(' ')) {
          out.push(oldLines[cursor++]!)
        }
      }
    }
  })
  while (cursor < oldLines.length) out.push(oldLines[cursor++]!)
  return out.join('\n') + (trailingNewline || out.length ? '\n' : '')
}

/** Stage `content` for `path` without changing the worktree. */
async function stageContent(repo: Repo, path: string, content: string): Promise<void> {
  const abs = `${repo.dir}/${path}`
  const original = await repo.fs.promises.readFile(abs)
  await repo.fs.promises.writeFile(abs, content)
  await stagePath(repo, path, true)
  await repo.fs.promises.writeFile(abs, original as Uint8Array)
}

export async function startAddPatch(ctx: CommandContext, repo: Repo, specs: string[]): Promise<number> {
  const status = await computeStatus(repo)
  const index = await readIndex(repo)
  let candidates = status.entries.filter((e) => e.unstaged === 'modified').map((e) => e.path)
  if (specs.length) {
    const wanted = new Set<string>()
    for (const s of specs) for (const p of await expandPathspec(ctx, repo, s)) wanted.add(p)
    candidates = candidates.filter((p) => wanted.has(p))
    for (const p of wanted) {
      const e = status.entries.find((x) => x.path === p)
      if (e?.untracked) throw fatal(`'${p}' is untracked. Use 'git add ${p}' to stage a new file; -p only works on tracked changes.`)
    }
  }
  const jobs: FileJob[] = []
  for (const path of candidates) {
    const entry = index.get(path)
    if (!entry) continue
    const indexText = await repo.readBlobText(entry.oid)
    const worktreeText = (await readTextOrNull(ctx.fs, `${repo.dir}/${path}`)) ?? ''
    const patch = structuredPatch(path, path, indexText, worktreeText, '', '', { context: 3 })
    if (!patch.hunks.length) continue
    jobs.push({ path, indexText, worktreeText, hunks: patch.hunks as Hunk[], accepted: patch.hunks.map(() => false) })
  }
  if (!jobs.length) {
    ctx.out.push('No changes.')
    return 0
  }

  let fi = 0
  let hi = 0
  const total = () => jobs[fi]!.hunks.length
  const promptFor = () => `(${hi + 1}/${total()}) Stage this hunk [y,n,q,a,d,s,?]? `
  const showHunk = (): string[] => {
    const job = jobs[fi]!
    const out: string[] = []
    if (hi === 0) out.push(ansi.bold(`diff --git a/${job.path} b/${job.path}`), ansi.bold(`--- a/${job.path}`), ansi.bold(`+++ b/${job.path}`))
    out.push(...renderHunk(job.hunks[hi]!))
    return out
  }
  const finishFile = async () => {
    const job = jobs[fi]!
    if (job.accepted.some(Boolean)) {
      const content = job.accepted.every(Boolean) ? job.worktreeText : applyHunks(job.indexText, job.hunks, job.accepted)
      await stageContent(repo, job.path, content)
    }
  }
  const advance = async (): Promise<{ output: string[]; done: boolean; prompt?: string }> => {
    hi++
    if (hi >= total()) {
      await finishFile()
      fi++
      hi = 0
      if (fi >= jobs.length) return { output: [], done: true }
    }
    return { output: showHunk(), done: false, prompt: promptFor() }
  }

  ctx.out.push(...showHunk())
  const interaction: Interaction = {
    prompt: promptFor(),
    async handle(line) {
      const answer = line.trim().toLowerCase()
      const job = jobs[fi]!
      switch (answer) {
        case 'y':
          job.accepted[hi] = true
          return advance()
        case 'n':
          job.accepted[hi] = false
          return advance()
        case 'a': {
          for (let k = hi; k < job.hunks.length; k++) job.accepted[k] = true
          hi = job.hunks.length - 1
          return advance()
        }
        case 'd': {
          for (let k = hi; k < job.hunks.length; k++) job.accepted[k] = false
          hi = job.hunks.length - 1
          return advance()
        }
        case 'q': {
          await finishFile()
          return { output: [], done: true }
        }
        case 's': {
          const h = job.hunks[hi]!
          const split = splitHunk(h)
          if (split.length < 2) return { output: ['Sorry, cannot split this hunk', ...renderHunk(h)], done: false, prompt: promptFor() }
          job.hunks.splice(hi, 1, ...split)
          job.accepted.splice(hi, 1, ...split.map(() => false))
          return { output: [`Split into ${split.length} hunks.`, ...renderHunk(job.hunks[hi]!)], done: false, prompt: promptFor() }
        }
        case '?':
        case 'h':
          return {
            output: [
              'y - stage this hunk',
              'n - do not stage this hunk',
              'q - quit; do not stage this hunk or any of the remaining ones',
              'a - stage this hunk and all later hunks in the file',
              'd - do not stage this hunk or any of the later hunks in the file',
              's - split the current hunk into smaller hunks',
              '? - print help',
            ],
            done: false,
            prompt: promptFor(),
          }
        default:
          return { output: [ansi.yellow(`Unknown answer '${line.trim()}'. Type ? for help.`)], done: false, prompt: promptFor() }
      }
    },
  }
  ctx.interaction = interaction
  return 0
}

/** Split a hunk at context runs between change groups. */
function splitHunk(h: Hunk): Hunk[] {
  const groups: string[][] = []
  let cur: string[] = []
  let inChange = false
  let seenChange = false
  for (const l of h.lines) {
    const isChange = l.startsWith('+') || l.startsWith('-')
    if (!isChange && inChange && seenChange) {
      // context after a change: candidate boundary; start new group at next change
      cur.push(l)
      inChange = false
      continue
    }
    if (isChange && !inChange && seenChange && cur.some((x) => x.startsWith('+') || x.startsWith('-'))) {
      groups.push(cur)
      cur = []
    }
    cur.push(l)
    if (isChange) {
      inChange = true
      seenChange = true
    }
  }
  if (cur.length) groups.push(cur)
  if (groups.length < 2) return [h]
  // Recompute line numbers per group.
  const out: Hunk[] = []
  let oldPos = h.oldStart
  let newPos = h.newStart
  for (const g of groups) {
    const oldLines = g.filter((l) => !l.startsWith('+')).length
    const newLines = g.filter((l) => !l.startsWith('-')).length
    out.push({ oldStart: oldPos, oldLines, newStart: newPos, newLines, lines: g })
    oldPos += oldLines
    newPos += newLines
  }
  return out
}

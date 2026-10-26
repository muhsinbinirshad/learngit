import { fatal, GitError } from '../../git/errors'
import { shortOid, subjectOf, type Repo } from '../../git/repo'
import { revList, blame, logForPath, type CommitNode } from '../../git/history'
import { renderAsciiGraph } from '../../git/graph'
import { diffCommits, diffStaged, diffWorktree, diffWorktreeAgainst, formatStat, formatUnified, type FileDiff } from '../../git/diff'
import { readFileAtCommit } from '../../git/tree'
import { bisectLog, bisectMark, bisectReset, bisectStart } from '../../git/bisect'
import { parseArgs } from '../args'
import { ansi, gitDate, relativeDate } from '../format'
import { findRepo, repoPath } from './context'
import type { GitSubcommand } from './index'

async function decorations(repo: Repo): Promise<Map<string, string[]>> {
  const refs = await repo.listAllRefs()
  const branch = await repo.currentBranch()
  const head = await repo.headOid()
  const map = new Map<string, string[]>()
  const add = (oid: string, label: string) => {
    if (!map.has(oid)) map.set(oid, [])
    map.get(oid)!.push(label)
  }
  if (head && !branch) add(head, ansi.boldCyan('HEAD'))
  for (const r of refs) {
    if (r.kind === 'branch') {
      if (r.short === branch) add(r.oid, `${ansi.boldCyan('HEAD -> ')}${ansi.boldGreen(r.short)}`)
      else add(r.oid, ansi.boldGreen(r.short))
    } else if (r.kind === 'tag') add(r.oid, ansi.boldYellow(`tag: ${r.short}`))
    else if (r.kind === 'remote') add(r.oid, ansi.boldRed(r.short))
    else if (r.kind === 'stash') add(r.oid, ansi.boldMagenta('refs/stash'))
  }
  // Put HEAD first.
  for (const [oid, labels] of map) {
    labels.sort((a, b) => Number(b.includes('HEAD')) - Number(a.includes('HEAD')))
    map.set(oid, labels)
  }
  return map
}

function decorate(deco: Map<string, string[]>, oid: string): string {
  const d = deco.get(oid)
  return d?.length ? ` ${ansi.yellow('(')}${d.join(ansi.yellow(', '))}${ansi.yellow(')')}` : ''
}

export function formatCommitFull(c: CommitNode, deco: Map<string, string[]>, nowSeconds: number, relative = false): string[] {
  const lines = [`${ansi.yellow(`commit ${c.oid}`)}${decorate(deco, c.oid)}`]
  if (c.parents.length > 1) lines.push(`Merge: ${c.parents.map((p) => shortOid(p)).join(' ')}`)
  lines.push(`Author: ${c.author.name} <${c.author.email}>`)
  lines.push(`Date:   ${relative ? relativeDate(c.author.timestamp, nowSeconds) : gitDate(c.author.timestamp)}`)
  lines.push('')
  for (const l of c.message.replace(/\n+$/, '').split('\n')) lines.push(`    ${l}`)
  return lines
}

const log: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--oneline': 'oneline',
      '--graph': 'graph',
      '--all': 'all',
      '--decorate': 'decorate',
      '--no-decorate': 'noDecorate',
      '--stat': 'stat',
      '-p': 'patch',
      '--patch': 'patch',
      '--first-parent': 'firstParent',
      '--reverse': 'reverse',
      '--abbrev-commit': 'abbrev',
      '--no-merges': 'noMerges',
      '--merges': 'merges',
      '--relative-date': 'relative',
      '--name-only': 'nameOnly',
      '--name-status': 'nameStatus',
      '--follow': 'follow',
    },
    values: {
      '-n': 'count',
      '--max-count': 'count',
      '--author': 'author',
      '--grep': 'grep',
      '--since': 'since',
      '--after': 'since',
      '--until': 'until',
      '--before': 'until',
      '--format': 'format',
      '--pretty': 'format',
      '-S': 'pickaxe',
      '-L': 'lineRange',
    },
  })
  if (parsed.values['pickaxe'] || parsed.values['lineRange'])
    throw fatal(`that log option isn't available in Commit Lab. Use 'git log -- <path>' and 'git blame <file>' to trace changes.`)
  const repo = await findRepo(ctx)
  const head = await repo.headOid()
  const revs: string[] = []
  const paths: string[] = [...parsed.afterDashDash]
  for (const p of parsed.positional) {
    try {
      if (p.includes('..') && !p.startsWith('.')) {
        revs.push(p)
        continue
      }
      await repo.resolveRevision(p)
      revs.push(p)
    } catch {
      paths.push(p)
    }
  }
  if (!head && !revs.length && !parsed.flags.has('all')) {
    const branch = await repo.currentBranch()
    throw fatal(`your current branch '${branch}' does not have any commits yet`)
  }
  let include: string[] = []
  const exclude: string[] = []
  for (const r of revs) {
    const range = /^(.*)\.\.(.*)$/.exec(r)
    if (range && !r.includes('...')) {
      exclude.push(await repo.resolveRevision(range[1] || 'HEAD'))
      include.push(await repo.resolveRevision(range[2] || 'HEAD'))
    } else if (r.startsWith('^')) exclude.push(await repo.resolveRevision(r.slice(1)))
    else include.push(await repo.resolveRevision(r))
  }
  if (parsed.flags.has('all')) {
    include.push(...(await repo.listAllRefs()).map((r) => r.oid))
    if (head) include.push(head)
  }
  if (!include.length && head) include = [head]
  include = [...new Set(include)]
  let commits = await revList(repo, include, exclude, { firstParent: parsed.flags.has('firstParent') })
  if (paths.length) {
    const repoPaths = paths.map((p) => repoPath(ctx, repo, p))
    const keep = new Set<string>()
    for (const p of repoPaths) for (const c of await logForPath(repo, include[0]!, p)) keep.add(c.oid)
    commits = commits.filter((c) => keep.has(c.oid))
  }
  if (parsed.flags.has('noMerges')) commits = commits.filter((c) => c.parents.length <= 1)
  if (parsed.flags.has('merges')) commits = commits.filter((c) => c.parents.length > 1)
  if (parsed.values['author']) {
    const re = new RegExp(parsed.values['author'], 'i')
    commits = commits.filter((c) => re.test(c.author.name) || re.test(c.author.email))
  }
  if (parsed.values['grep']) {
    const re = new RegExp(parsed.values['grep'], 'i')
    commits = commits.filter((c) => re.test(c.message))
  }
  const count = parsed.values['count'] ? parseInt(parsed.values['count'], 10) : undefined
  if (count !== undefined) commits = commits.slice(0, count)
  if (parsed.flags.has('reverse')) commits = [...commits].reverse()

  const deco = parsed.flags.has('noDecorate') ? new Map<string, string[]>() : await decorations(repo)
  const now = ctx.clock.now()
  const format = parsed.values['format']
  const oneline = parsed.flags.has('oneline') || format === 'oneline'

  const renderOne = async (c: CommitNode): Promise<string[]> => {
    let lines: string[]
    if (format && format !== 'oneline' && format !== 'full' && format !== 'medium') {
      lines = [applyFormat(format, c, deco)]
    } else if (oneline) {
      lines = [`${ansi.yellow(shortOid(c.oid))}${decorate(deco, c.oid)} ${subjectOf(c.message)}`]
    } else {
      lines = formatCommitFull(c, deco, now, parsed.flags.has('relative'))
    }
    if (parsed.flags.has('stat') || parsed.flags.has('patch') || parsed.flags.has('nameOnly') || parsed.flags.has('nameStatus')) {
      const diffs = await diffCommits(repo, c.parents[0] ?? null, c.oid)
      if (!oneline) lines.push('')
      if (parsed.flags.has('nameOnly')) lines.push(...diffs.map((d) => d.path))
      else if (parsed.flags.has('nameStatus')) lines.push(...diffs.map((d) => `${d.status === 'added' ? 'A' : d.status === 'deleted' ? 'D' : 'M'}\t${d.path}`))
      else if (parsed.flags.has('stat')) lines.push(...formatStat(diffs))
      if (parsed.flags.has('patch')) {
        if (parsed.flags.has('stat')) lines.push('')
        lines.push(...formatUnified(diffs, true))
      }
    }
    return lines
  }

  if (parsed.flags.has('graph')) {
    const rendered = new Map<string, string[]>()
    for (const c of commits) rendered.set(c.oid, await renderOne(c))
    const lines = renderAsciiGraph(commits, (c) => {
      const r = rendered.get(c.oid)!
      return oneline ? r : [...r, '']
    })
    ctx.out.push(...lines)
    return
  }
  for (let i = 0; i < commits.length; i++) {
    const lines = await renderOne(commits[i]!)
    ctx.out.push(...lines)
    if (!oneline && !format && i < commits.length - 1) ctx.out.push('')
  }
}

function applyFormat(format: string, c: CommitNode, deco: Map<string, string[]>): string {
  const d = deco.get(c.oid)
  return format
    .replace(/^(format:|tformat:)/, '')
    .replace(/%H/g, c.oid)
    .replace(/%h/g, shortOid(c.oid))
    .replace(/%s/g, subjectOf(c.message))
    .replace(/%b/g, c.message.split('\n').slice(1).join('\n').trim())
    .replace(/%an/g, c.author.name)
    .replace(/%ae/g, c.author.email)
    .replace(/%ad/g, gitDate(c.author.timestamp))
    .replace(/%ar/g, relativeDate(c.author.timestamp, Math.floor(Date.now() / 1000)))
    .replace(/%d/g, d?.length ? ` (${d.join(', ')})` : '')
    .replace(/%D/g, d?.join(', ') ?? '')
    .replace(/%p/g, c.parents.map((p) => shortOid(p)).join(' '))
    .replace(/%P/g, c.parents.join(' '))
    .replace(/%n/g, '\n')
    .replace(/%C\([^)]*\)/g, '')
    .replace(/%Creset/g, '')
}

const show: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: { '--stat': 'stat', '--name-only': 'nameOnly', '--no-patch': 'noPatch', '-s': 'noPatch', '--oneline': 'oneline', '-q': 'noPatch' },
    values: { '--format': 'format', '--pretty': 'format' },
  })
  const repo = await findRepo(ctx)
  const targets = parsed.positional.length ? parsed.positional : ['HEAD']
  const deco = await decorations(repo)
  for (const t of targets) {
    const colon = t.indexOf(':')
    if (colon > 0) {
      const rev = t.slice(0, colon)
      const path = t.slice(colon + 1)
      const oid = await repo.resolveRevision(rev)
      const content = await readFileAtCommit(repo, oid, path.replace(/^\.\//, ''))
      if (content === null) throw fatal(`path '${path}' does not exist in '${rev}'`)
      ctx.out.push(...content.replace(/\n$/, '').split('\n'))
      continue
    }
    const oid = await repo.resolveRevision(t)
    const r = await repo.readCommit(oid)
    const node = { oid, parents: r.commit.parent, message: r.commit.message, author: r.commit.author, committer: r.commit.committer, tree: r.commit.tree }
    if (parsed.flags.has('oneline')) ctx.out.push(`${ansi.yellow(shortOid(oid))}${decorate(deco, oid)} ${subjectOf(node.message)}`)
    else ctx.out.push(...formatCommitFull(node, deco, ctx.clock.now()))
    if (parsed.flags.has('noPatch')) continue
    const diffs = node.parents.length > 1 ? [] : await diffCommits(repo, node.parents[0] ?? null, oid)
    ctx.out.push('')
    if (node.parents.length > 1) {
      ctx.out.push(ansi.gray('(merge commit: showing no combined diff; use git show <merge>^1 / ^2 to inspect each parent)'))
      continue
    }
    if (parsed.flags.has('nameOnly')) ctx.out.push(...diffs.map((d) => d.path))
    else if (parsed.flags.has('stat')) ctx.out.push(...formatStat(diffs))
    else ctx.out.push(...formatUnified(diffs, true))
  }
}

const diff: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: {
      '--staged': 'staged',
      '--cached': 'staged',
      '--stat': 'stat',
      '--name-only': 'nameOnly',
      '--name-status': 'nameStatus',
      '-w': 'ignoreWs',
      '--ignore-all-space': 'ignoreWs',
      '--color': 'color',
      '--no-color': 'noColor',
      '--word-diff': 'wordDiff',
      '--quiet': 'quiet',
    },
    values: { '-U': 'context', '--unified': 'context' },
  })
  const repo = await findRepo(ctx)
  const revs: string[] = []
  const paths: string[] = [...parsed.afterDashDash]
  for (const p of parsed.positional) {
    const isRev =
      p.includes('..') ||
      (await repo
        .resolveRevision(p)
        .then(() => true)
        .catch(() => false))
    if (isRev && revs.length < 2) revs.push(p)
    else paths.push(p)
  }
  const repoPaths = paths.length ? paths.map((p) => repoPath(ctx, repo, p)) : undefined
  let diffs: FileDiff[]
  if (revs.length === 1 && revs[0]!.includes('..')) {
    const [a, b] = revs[0]!.split(/\.\.\.?/)
    diffs = await diffCommits(repo, await repo.resolveRevision(a || 'HEAD'), await repo.resolveRevision(b || 'HEAD'), repoPaths)
  } else if (revs.length === 2) {
    diffs = await diffCommits(repo, await repo.resolveRevision(revs[0]!), await repo.resolveRevision(revs[1]!), repoPaths)
  } else if (revs.length === 1) {
    if (parsed.flags.has('staged')) {
      const { readFlatTree, readIndex } = await import('../../git/tree')
      const { diffFlatTreeContents } = await import('../../git/diff')
      diffs = await diffFlatTreeContents(repo, await readFlatTree(repo, await repo.resolveRevision(revs[0]!)), await readIndex(repo), repoPaths)
    } else diffs = await diffWorktreeAgainst(repo, await repo.resolveRevision(revs[0]!), repoPaths)
  } else if (parsed.flags.has('staged')) {
    diffs = await diffStaged(repo, repoPaths)
  } else {
    diffs = await diffWorktree(repo, repoPaths)
  }
  if (parsed.flags.has('quiet')) return diffs.length ? 1 : 0
  if (parsed.flags.has('nameOnly')) ctx.out.push(...diffs.map((d) => d.path))
  else if (parsed.flags.has('nameStatus')) ctx.out.push(...diffs.map((d) => `${d.status === 'added' ? 'A' : d.status === 'deleted' ? 'D' : 'M'}\t${d.path}`))
  else if (parsed.flags.has('stat')) ctx.out.push(...formatStat(diffs))
  else ctx.out.push(...formatUnified(diffs, !parsed.flags.has('noColor')))
}

const blameCmd: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, {
    flags: { '-s': 'suppress', '-e': 'email', '--date=short': 'short', '-w': 'ws' },
    values: { '-L': 'range', '--date': 'date' },
  })
  const repo = await findRepo(ctx)
  const [file, rev] = [...parsed.positional, ...parsed.afterDashDash]
  if (!file) throw fatal('usage: git blame <file> [<rev>]')
  const path = repoPath(ctx, repo, file)
  const lines = await blame(repo, path, rev ?? 'HEAD')
  let range: [number, number] | null = null
  if (parsed.values['range']) {
    const m = /^(\d+),(\d+)$/.exec(parsed.values['range'])
    if (!m) throw fatal(`-L expects <start>,<end>`)
    range = [parseInt(m[1]!, 10), parseInt(m[2]!, 10)]
  }
  const width = String(lines.length).length
  for (const l of lines) {
    if (range && (l.lineNo < range[0] || l.lineNo > range[1])) continue
    const d = new Date(l.timestamp * 1000)
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const who = parsed.flags.has('suppress') ? '' : ` (${l.author.padEnd(14).slice(0, 14)} ${date} ${String(l.lineNo).padStart(width)})`
    ctx.out.push(`${ansi.yellow(shortOid(l.oid, 8))}${who} ${l.text}`)
  }
}

const reflog: GitSubcommand = async (ctx, args) => {
  const parsed = parseArgs(args, { flags: { '--all': 'all' }, values: { '-n': 'count' } })
  const repo = await findRepo(ctx)
  let positional = parsed.positional
  if (positional[0] === 'show') positional = positional.slice(1)
  if (positional[0] === 'expire' || positional[0] === 'delete')
    throw fatal(`'git reflog ${positional[0]}' is not needed in Commit Lab; the reflog is kept for the whole lab.`)
  const refArg = positional[0] ?? 'HEAD'
  const ref = refArg === 'HEAD' ? 'HEAD' : refArg === 'stash' ? 'refs/stash' : (await repo.branchExists(refArg)) ? `refs/heads/${refArg}` : refArg
  const entries = await repo.readReflog(ref)
  const deco = await decorations(repo)
  const label = refArg === 'HEAD' ? 'HEAD' : refArg
  const count = parsed.values['count'] ? parseInt(parsed.values['count'], 10) : entries.length
  entries.slice(0, count).forEach((e, i) => {
    ctx.out.push(`${ansi.yellow(shortOid(e.newOid))}${decorate(deco, e.newOid)} ${label}@{${i}}: ${e.message}`)
  })
}

const bisect: GitSubcommand = async (ctx, args) => {
  const repo = await findRepo(ctx)
  const [sub, ...rest] = args
  switch (sub) {
    case 'start': {
      const [bad, ...good] = rest.filter((a) => !a.startsWith('-'))
      ctx.out.push(...(await bisectStart(repo, bad, good)))
      ctx.reflogMessage = 'bisect: start'
      return
    }
    case 'good':
    case 'bad':
    case 'old':
    case 'new': {
      const verdict = sub === 'good' || sub === 'old' ? 'good' : 'bad'
      const lines = await bisectMark(repo, verdict, rest[0])
      ctx.reflogMessage = `bisect: ${verdict}`
      ctx.out.push(...lines)
      return
    }
    case 'reset':
      ctx.out.push(...(await bisectReset(repo)))
      ctx.reflogMessage = 'bisect: reset'
      return
    case 'log':
      ctx.out.push(...(await bisectLog(repo)))
      return
    case 'skip':
      throw fatal(`'git bisect skip' is not available here. Mark the commit good or bad instead.`)
    case 'run':
      throw fatal(`'git bisect run' needs a test script, which this environment cannot execute. Test manually and mark good/bad.`)
    default:
      throw new GitError('usage: git bisect start [<bad> [<good>...]] | good | bad | reset | log', { prefix: 'none', exitCode: 129 })
  }
}

export const history: Record<string, GitSubcommand> = { log, show, diff, blame: blameCmd, reflog, bisect }

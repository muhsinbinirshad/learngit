/**
 * Operations that combine histories: merge, cherry-pick, revert, rebase, and their --continue/--abort.
 * All of them funnel through `mergeTrees` so conflicts behave identically everywhere.
 */
import type { Repo, RebaseState, RebaseTodoItem } from './repo'
import { shortOid, subjectOf } from './repo'
import { fatal, gitErr, plain } from './errors'
import { mergeTrees, formatConflictLines, type TreeMergeResult } from './merge'
import { commitTreeOid, readFlatTree, readIndex, writeFlatTree, type FlatTree } from './tree'
import { applyTreeChange, assertNoClobber, computeStatus, hardCheckoutTree } from './worktree'
import { createCommit, diffStat } from './commit'
import { revList } from './history'

export interface IntegrateOutcome {
  status: 'ok' | 'conflict' | 'noop' | 'fast-forward'
  lines: string[]
  commitOid?: string
}

/** Write a merged tree into worktree + index. Conflicted paths are written with markers but not staged. */
async function applyMergeResult(repo: Repo, oursTree: FlatTree, result: TreeMergeResult): Promise<void> {
  const conflictPaths = new Set(result.conflicts.map((c) => c.path))
  await applyTreeChange(repo, oursTree, result.tree, { stage: true, skip: conflictPaths })
  for (const path of conflictPaths) {
    const entry = result.tree.get(path)
    if (entry) {
      const { writeFileDeep } = await import('../fs')
      await writeFileDeep(repo.fs, `${repo.dir}/${path}`, await repo.readBlob(entry.oid))
    }
  }
  await repo.setConflicts([...conflictPaths].sort())
}

async function requireCleanForIntegration(repo: Repo, changed: string[], verb: 'merge' | 'checkout'): Promise<void> {
  const status = await computeStatus(repo)
  if (status.conflicted.length) throw fatal('You have unmerged paths. Resolve them before continuing.')
  await assertNoClobber(repo, changed, verb)
}

function requireNoOperationInProgress(state: Awaited<ReturnType<Repo['state']>>, verb: string): void {
  if (state.mergeHead) throw fatal(`You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you ${verb}.`)
  if (state.cherryPickHead) throw fatal(`You have not concluded your cherry-pick (CHERRY_PICK_HEAD exists).\nPlease, commit your changes before you ${verb}.`)
  if (state.revertHead) throw fatal(`You have not concluded your revert (REVERT_HEAD exists).\nPlease, commit your changes before you ${verb}.`)
  if (state.rebase)
    throw fatal(`It seems that there is already a rebase-merge directory.\nIf that is the case, please try\n\tgit rebase (--continue | --abort | --skip)`)
}

// ---- merge ------------------------------------------------------------------------------------

export async function mergeRef(
  repo: Repo,
  ref: string,
  opts: { noFf?: boolean; ffOnly?: boolean; message?: string; squash?: boolean } = {},
): Promise<IntegrateOutcome> {
  const state = await repo.state()
  requireNoOperationInProgress(state, 'merge')
  const head = await repo.headOid()
  if (!head) throw fatal(`merging into an unborn branch is not supported here. Make a commit first.`)
  let theirs: string
  try {
    theirs = await repo.resolveRevision(ref)
  } catch {
    throw new (await import('./errors')).GitError(`merge: ${ref} - not something we can merge`, { prefix: 'none' })
  }
  const branch = await repo.currentBranch()

  if (await repo.isAncestor(theirs, head)) return { status: 'noop', lines: ['Already up to date.'] }

  const base = await repo.mergeBase(head, theirs)
  if (!base) throw fatal('refusing to merge unrelated histories')

  if (base === head && !opts.noFf && !opts.squash) {
    // Fast-forward
    const fromTree = await readFlatTree(repo, head)
    const toTree = await readFlatTree(repo, theirs)
    const changed = [...new Set([...fromTree.keys(), ...toTree.keys()])].filter((p) => fromTree.get(p)?.oid !== toTree.get(p)?.oid)
    await requireCleanForIntegration(repo, changed, 'merge')
    await applyTreeChange(repo, fromTree, toTree, { stage: true })
    await repo.moveHead(theirs)
    const stat = await diffStat(repo, await commitTreeOid(repo, head), await commitTreeOid(repo, theirs))
    return {
      status: 'fast-forward',
      commitOid: theirs,
      lines: [`Updating ${shortOid(head)}..${shortOid(theirs)}`, 'Fast-forward', ...statLines(stat)],
    }
  }
  if (opts.ffOnly) throw fatal('Not possible to fast-forward, aborting.')

  const result = await mergeTrees(repo, base, head, theirs, { ours: 'HEAD', theirs: ref })
  await requireCleanForIntegration(repo, result.changedFromOurs, 'merge')
  const oursTree = await readFlatTree(repo, head)
  await applyMergeResult(repo, oursTree, result)
  const defaultMessage = opts.message ?? `Merge branch '${ref}'${branch && branch !== 'main' && branch !== 'master' ? ` into ${branch}` : ''}`

  if (result.conflicts.length) {
    await repo.setOrigHead(head)
    await repo.setMergeHead(theirs)
    await repo.setMergeMsg(`${defaultMessage}\n\n# Conflicts:\n${result.conflicts.map((c) => `#\t${c.path}`).join('\n')}\n`)
    return { status: 'conflict', lines: [...formatConflictLines(result), 'Automatic merge failed; fix conflicts and then commit the result.'] }
  }

  if (opts.squash) {
    await repo.setMergeMsg(
      `Squashed commit of the following:\n\n${(await revList(repo, [theirs], [head])).map((c) => `commit ${c.oid}\n    ${subjectOf(c.message)}`).join('\n\n')}\n`,
    )
    return {
      status: 'ok',
      lines: ['Squash commit -- not updating HEAD', ...formatConflictLines(result), 'Automatic merge went well; stopped before committing as requested'],
    }
  }

  await repo.setOrigHead(head)
  const treeOid = await writeFlatTree(repo, result.tree)
  const commit = await createCommit(repo, { message: defaultMessage, parents: [head, theirs], tree: treeOid, allowEmpty: true })
  const stat = await diffStat(repo, await commitTreeOid(repo, head), treeOid)
  return {
    status: 'ok',
    commitOid: commit.oid,
    lines: [...formatConflictLines(result), `Merge made by the 'ort' strategy.`, ...statLines(stat)],
  }
}

export async function abortMerge(repo: Repo): Promise<void> {
  const mergeHead = await repo.getMergeHead()
  if (!mergeHead) throw fatal('There is no merge to abort (MERGE_HEAD missing).')
  const orig = (await repo.getOrigHead()) ?? (await repo.headOid())!
  await hardCheckoutTree(repo, orig)
  await repo.clearOperationState()
}

/** Finish a conflicted merge after the learner staged resolutions (called by `git commit`). */
export async function concludeMerge(repo: Repo, message?: string): Promise<{ oid: string; lines: string[] }> {
  const head = (await repo.headOid())!
  const mergeHead = (await repo.getMergeHead())!
  const conflicts = await repo.getConflicts()
  if (conflicts.length) {
    throw gitErr(
      `Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`,
    )
  }
  const msg =
    message ??
    ((await repo.getMergeMsg()) ?? 'Merge')
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n')
      .trim()
  const commit = await createCommit(repo, { message: msg, parents: [head, mergeHead], allowEmpty: true })
  await repo.clearOperationState()
  return { oid: commit.oid, lines: [`[${commit.branch ?? 'detached HEAD'} ${shortOid(commit.oid)}] ${subjectOf(msg)}`] }
}

// ---- cherry-pick / revert ---------------------------------------------------------------------

interface ApplyPatchResult {
  status: 'ok' | 'conflict' | 'empty'
  result: TreeMergeResult
  treeOid?: string
}

/** Apply the change introduced by `commitOid` (or its inverse) on top of HEAD without committing. */
async function applyCommitAsPatch(repo: Repo, commitOid: string, inverse: boolean, label: string): Promise<ApplyPatchResult> {
  const head = (await repo.headOid())!
  const { commit } = await repo.readCommit(commitOid)
  const parent = commit.parent[0] ?? null
  if (commit.parent.length > 1)
    throw fatal(`commit ${shortOid(commitOid)} is a merge; mainline selection is not supported here. Pick the non-merge commits instead.`)
  const labels = { ours: 'HEAD', theirs: label }
  let result: TreeMergeResult
  if (inverse && !parent) {
    // Reverting a root commit: "theirs" is the empty tree.
    const { mergeFlatTrees } = await import('./merge')
    result = await mergeFlatTrees(repo, await readFlatTree(repo, commitOid), await readFlatTree(repo, head), new Map(), labels)
  } else {
    const base = inverse ? commitOid : parent
    const theirs = inverse ? parent! : commitOid
    result = await mergeTrees(repo, base, head, theirs, labels)
  }
  return finishApply(repo, head, result)
}

async function finishApply(repo: Repo, head: string, result: TreeMergeResult): Promise<ApplyPatchResult> {
  await requireCleanForIntegration(repo, result.changedFromOurs, 'merge')
  const oursTree = await readFlatTree(repo, head)
  await applyMergeResult(repo, oursTree, result)
  if (result.conflicts.length) return { status: 'conflict', result }
  const treeOid = await writeFlatTree(repo, result.tree)
  if (treeOid === (await commitTreeOid(repo, head))) return { status: 'empty', result, treeOid }
  return { status: 'ok', result, treeOid }
}

export async function cherryPick(repo: Repo, revs: string[], opts: { noCommit?: boolean } = {}): Promise<IntegrateOutcome> {
  const state = await repo.state()
  requireNoOperationInProgress(state, 'cherry-pick')
  const lines: string[] = []
  let lastOid: string | undefined
  for (const rev of revs) {
    const oid = await repo.resolveRevision(rev)
    const { commit } = await repo.readCommit(oid)
    const applied = await applyCommitAsPatch(repo, oid, false, `${shortOid(oid)} (${subjectOf(commit.message)})`)
    if (applied.status === 'conflict') {
      await repo.setCherryPickHead(oid)
      lines.push(...formatConflictLines(applied.result))
      lines.push(`error: could not apply ${shortOid(oid)}... ${subjectOf(commit.message)}`)
      lines.push('hint: After resolving the conflicts, mark them with')
      lines.push('hint: "git add/rm <pathspec>", then run')
      lines.push('hint: "git cherry-pick --continue".')
      lines.push('hint: You can instead skip this commit with "git cherry-pick --skip".')
      lines.push('hint: To abort and get back to the state before "git cherry-pick",')
      lines.push('hint: run "git cherry-pick --abort".')
      return { status: 'conflict', lines }
    }
    if (opts.noCommit) {
      lines.push(...formatConflictLines(applied.result))
      continue
    }
    if (applied.status === 'empty') {
      lines.push(`The previous cherry-pick is now empty, possibly due to conflict resolution.`)
      continue
    }
    const headTreeBefore = await commitTreeOid(repo, await repo.headOid())
    const created = await createCommit(repo, {
      message: commit.message,
      tree: applied.treeOid,
      author: { name: commit.author.name, email: commit.author.email, timestamp: commit.author.timestamp },
    })
    lastOid = created.oid
    const stat = await diffStat(repo, headTreeBefore, applied.treeOid!)
    lines.push(`[${created.branch ?? 'detached HEAD'} ${shortOid(created.oid)}] ${subjectOf(commit.message)}`)
    lines.push(` Date: ${new Date(commit.author.timestamp * 1000).toUTCString()}`)
    lines.push(...statLines(stat))
  }
  return { status: 'ok', lines, commitOid: lastOid }
}

export async function revertCommits(repo: Repo, revs: string[], opts: { noCommit?: boolean; noEdit?: boolean } = {}): Promise<IntegrateOutcome> {
  const state = await repo.state()
  requireNoOperationInProgress(state, 'revert')
  const lines: string[] = []
  let lastOid: string | undefined
  for (const rev of revs) {
    const oid = await repo.resolveRevision(rev)
    const { commit } = await repo.readCommit(oid)
    const applied = await applyCommitAsPatch(repo, oid, true, `parent of ${shortOid(oid)} (${subjectOf(commit.message)})`)
    const message = `Revert "${subjectOf(commit.message)}"\n\nThis reverts commit ${oid}.\n`
    if (applied.status === 'conflict') {
      await repo.setRevertHead(oid)
      await repo.setMergeMsg(message)
      lines.push(...formatConflictLines(applied.result))
      lines.push(`error: could not revert ${shortOid(oid)}... ${subjectOf(commit.message)}`)
      lines.push('hint: After resolving the conflicts, mark them with')
      lines.push('hint: "git add/rm <pathspec>", then run')
      lines.push('hint: "git revert --continue".')
      lines.push('hint: To abort and get back to the state before "git revert",')
      lines.push('hint: run "git revert --abort".')
      return { status: 'conflict', lines }
    }
    if (opts.noCommit) continue
    const headTreeBefore = await commitTreeOid(repo, await repo.headOid())
    const created = await createCommit(repo, { message, tree: applied.treeOid, allowEmpty: true })
    lastOid = created.oid
    const stat = await diffStat(repo, headTreeBefore, applied.treeOid ?? headTreeBefore)
    lines.push(`[${created.branch ?? 'detached HEAD'} ${shortOid(created.oid)}] Revert "${subjectOf(commit.message)}"`)
    lines.push(...statLines(stat))
  }
  return { status: 'ok', lines, commitOid: lastOid }
}

/** `--continue` for cherry-pick / revert after conflicts were resolved and staged. */
export async function continuePick(repo: Repo, kind: 'cherry-pick' | 'revert'): Promise<IntegrateOutcome> {
  const pending = kind === 'cherry-pick' ? await repo.getCherryPickHead() : await repo.getRevertHead()
  if (!pending) throw fatal(`no ${kind} in progress`)
  const conflicts = await repo.getConflicts()
  if (conflicts.length)
    throw gitErr(
      `Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`,
    )
  const { commit } = await repo.readCommit(pending)
  const created =
    kind === 'cherry-pick'
      ? await createCommit(repo, {
          message: commit.message,
          author: { name: commit.author.name, email: commit.author.email, timestamp: commit.author.timestamp },
          allowEmpty: true,
        })
      : await createCommit(repo, { message: (await repo.getMergeMsg()) ?? `Revert "${subjectOf(commit.message)}"`, allowEmpty: true })
  await repo.clearOperationState()
  return {
    status: 'ok',
    commitOid: created.oid,
    lines: [
      `[${created.branch ?? 'detached HEAD'} ${shortOid(created.oid)}] ${subjectOf(kind === 'cherry-pick' ? commit.message : `Revert "${subjectOf(commit.message)}"`)}`,
    ],
  }
}

export async function abortPick(repo: Repo, kind: 'cherry-pick' | 'revert'): Promise<void> {
  const pending = kind === 'cherry-pick' ? await repo.getCherryPickHead() : await repo.getRevertHead()
  if (!pending) throw fatal(`no ${kind} in progress`)
  const head = (await repo.headOid())!
  await hardCheckoutTree(repo, head)
  await repo.clearOperationState()
}

// ---- rebase -------------------------------------------------------------------------------------

export interface RebasePlanInput {
  upstream: string
  onto?: string
  interactive?: boolean
  /** Provided by the shell after the learner edits the todo list (interactive only). */
  editTodo?: (todoText: string) => Promise<string | null>
  /** Provided by the shell for reword/squash message editing. */
  editMessage?: (initial: string) => Promise<string | null>
}

export function formatTodo(items: { oid: string; subject: string }[], upstreamShort: string, headShort: string): string {
  const lines = items.map((i) => `pick ${shortOid(i.oid)} ${i.subject}`)
  lines.push('')
  lines.push(`# Rebase ${upstreamShort}..${headShort} onto ${upstreamShort} (${items.length} command${items.length === 1 ? '' : 's'})`)
  lines.push('#')
  lines.push('# Commands:')
  lines.push('# p, pick <commit> = use commit')
  lines.push('# r, reword <commit> = use commit, but edit the commit message')
  lines.push('# s, squash <commit> = use commit, but meld into previous commit')
  lines.push('# f, fixup <commit> = like "squash" but discard this commit\'s log message')
  lines.push('# d, drop <commit> = remove commit')
  lines.push('#')
  lines.push('# These lines can be re-ordered; they are executed from top to bottom.')
  lines.push('#')
  lines.push('# If you remove a line here THAT COMMIT WILL BE LOST.')
  lines.push('#')
  lines.push('# However, if you remove everything, the rebase will be aborted.')
  return lines.join('\n') + '\n'
}

const ACTIONS: Record<string, RebaseTodoItem['action']> = {
  p: 'pick',
  pick: 'pick',
  r: 'reword',
  reword: 'reword',
  s: 'squash',
  squash: 'squash',
  f: 'fixup',
  fixup: 'fixup',
  d: 'drop',
  drop: 'drop',
}

export async function parseTodo(repo: Repo, text: string): Promise<RebaseTodoItem[]> {
  const items: RebaseTodoItem[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [verb, ref] = line.split(/\s+/)
    const action = ACTIONS[verb ?? '']
    if (!action) throw gitErr(`invalid command '${verb}' in rebase todo list\nSupported: pick, reword, squash, fixup, drop`)
    if (!ref) throw gitErr(`missing commit in line: ${line}`)
    const oid = await repo.resolveRevision(ref)
    items.push({ action, oid })
  }
  return items
}

export async function rebase(repo: Repo, input: RebasePlanInput): Promise<IntegrateOutcome> {
  const state = await repo.state()
  requireNoOperationInProgress(state, 'rebase')
  const status = await computeStatus(repo)
  if (status.staged.length || status.unstaged.length) {
    throw gitErr(`cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.`)
  }
  const head = await repo.headOid()
  if (!head) throw fatal('no commits yet')
  const upstream = await repo.resolveRevision(input.upstream)
  const onto = input.onto ? await repo.resolveRevision(input.onto) : upstream
  const branch = await repo.currentBranch()
  const toReplay = (await revList(repo, [head], [upstream])).reverse().filter((c) => c.parents.length <= 1)

  if (!toReplay.length && !input.interactive) {
    if (await repo.isAncestor(head, onto)) {
      // Fast-forward branch to onto.
      const fromTree = await readFlatTree(repo, head)
      const toTree = await readFlatTree(repo, onto)
      await applyTreeChange(repo, fromTree, toTree, { stage: true })
      await repo.moveHead(onto)
      return { status: 'fast-forward', lines: [`Successfully rebased and updated ${branch ? `refs/heads/${branch}` : 'detached HEAD'}.`], commitOid: onto }
    }
    return { status: 'noop', lines: [`Current branch ${branch ?? 'HEAD'} is up to date.`] }
  }

  let todo: RebaseTodoItem[] = toReplay.map((c) => ({ action: 'pick', oid: c.oid }))
  if (input.interactive) {
    if (!input.editTodo) throw fatal('interactive rebase needs an editor')
    const text = formatTodo(
      toReplay.map((c) => ({ oid: c.oid, subject: subjectOf(c.message) })),
      shortOid(upstream),
      shortOid(head),
    )
    const edited = await input.editTodo(text)
    if (edited === null) return { status: 'noop', lines: ['Nothing to do: rebase aborted.'] }
    todo = await parseTodo(repo, edited)
    if (!todo.length) return { status: 'noop', lines: ['Nothing to do: rebase aborted.'] }
    if (todo[0]!.action === 'squash' || todo[0]!.action === 'fixup') {
      throw gitErr(`cannot '${todo[0]!.action}' without a previous commit`)
    }
  }

  const rb: RebaseState = {
    headName: branch ? `refs/heads/${branch}` : null,
    onto,
    origHead: head,
    upstream,
    todo,
    done: [],
    current: null,
    pendingMessage: null,
    interactive: !!input.interactive,
  }
  await repo.setOrigHead(head)
  // Detach HEAD at onto and update the worktree.
  const fromTree = await readFlatTree(repo, head)
  const ontoTree = await readFlatTree(repo, onto)
  await applyTreeChange(repo, fromTree, ontoTree, { stage: true })
  await repo.detachHead(onto)
  await repo.setRebaseState(rb)
  return runRebase(repo, rb, input.editMessage)
}

async function runRebase(repo: Repo, rb: RebaseState, editMessage?: (initial: string) => Promise<string | null>): Promise<IntegrateOutcome> {
  const lines: string[] = []
  while (rb.todo.length) {
    const item = rb.todo.shift()!
    rb.current = item
    await repo.setRebaseState(rb)
    const { commit } = await repo.readCommit(item.oid)
    const subject = subjectOf(commit.message)

    if (item.action === 'drop') {
      rb.done.push(item)
      continue
    }

    const applied = await applyCommitAsPatch(repo, item.oid, false, `${shortOid(item.oid)} (${subject})`)
    if (applied.status === 'conflict') {
      await repo.setRebaseState(rb)
      lines.push(...formatConflictLines(applied.result))
      lines.push(`error: could not apply ${shortOid(item.oid)}... ${subject}`)
      lines.push('hint: Resolve all conflicts manually, mark them as resolved with')
      lines.push('hint: "git add/rm <conflicted_files>", then run "git rebase --continue".')
      lines.push('hint: You can instead skip this commit: run "git rebase --skip".')
      lines.push('hint: To abort and get back to the state before "git rebase", run "git rebase --abort".')
      lines.push(`Could not apply ${shortOid(item.oid)}... ${subject}`)
      return { status: 'conflict', lines }
    }
    await commitForTodoItem(
      repo,
      rb,
      item,
      applied.treeOid!,
      commit.message,
      { name: commit.author.name, email: commit.author.email, timestamp: commit.author.timestamp },
      editMessage,
      applied.status === 'empty',
    )
    rb.done.push(item)
    rb.current = null
    await repo.setRebaseState(rb)
  }
  return finishRebase(repo, rb, lines)
}

/** Create the commit for a replayed todo item, handling reword/squash/fixup. */
async function commitForTodoItem(
  repo: Repo,
  rb: RebaseState,
  item: RebaseTodoItem,
  treeOid: string,
  originalMessage: string,
  author: { name: string; email: string; timestamp: number },
  editMessage: ((initial: string) => Promise<string | null>) | undefined,
  isEmpty: boolean,
): Promise<void> {
  const head = (await repo.headOid())!
  const nextIsSquash = rb.todo[0]?.action === 'squash' || rb.todo[0]?.action === 'fixup'

  if (item.action === 'squash' || item.action === 'fixup') {
    // Meld into previous commit: amend HEAD with the merged tree and combined message.
    const prev = await repo.readCommit(head)
    const combined = rb.pendingMessage ?? prev.commit.message
    const message = item.action === 'squash' ? `${combined.trimEnd()}\n\n${originalMessage.trimEnd()}\n` : combined
    if (nextIsSquash) {
      rb.pendingMessage = message
      await amendHead(repo, treeOid, message, prev.commit.author)
      return
    }
    let finalMessage = message
    if (item.action === 'squash' || rb.pendingMessage) {
      const needsEdit =
        message !== prev.commit.message && (item.action === 'squash' || (rb.pendingMessage !== null && rb.pendingMessage !== prev.commit.message))
      if (needsEdit && editMessage) {
        const edited = await editMessage(squashEditorText(message))
        if (edited !== null) finalMessage = stripComments(edited)
      }
    }
    rb.pendingMessage = null
    await amendHead(repo, treeOid, finalMessage, prev.commit.author)
    return
  }

  if (isEmpty) return // patch already upstream; git drops it

  let message = originalMessage
  if (item.action === 'reword' && editMessage && !nextIsSquash) {
    const edited = await editMessage(message)
    if (edited !== null && stripComments(edited).trim()) message = stripComments(edited)
  }
  await createCommit(repo, { message, tree: treeOid, author })
  if (nextIsSquash) rb.pendingMessage = message
}

function squashEditorText(message: string): string {
  return `# This is a combination of commits.\n# Edit the message below; lines starting with '#' are ignored.\n\n${message}`
}

export function stripComments(text: string): string {
  return (
    text
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

async function amendHead(
  repo: Repo,
  treeOid: string,
  message: string,
  author: { name: string; email: string; timestamp: number; timezoneOffset?: number },
): Promise<void> {
  const head = (await repo.headOid())!
  const prev = await repo.readCommit(head)
  const identity = await repo.identity()
  const oid = await repo.writeCommit({
    message: message.endsWith('\n') ? message : message + '\n',
    tree: treeOid,
    parent: prev.commit.parent,
    author: { name: author.name, email: author.email, timestamp: author.timestamp, timezoneOffset: 0 },
    committer: { name: identity.name, email: identity.email, timestamp: repo.clock.now(), timezoneOffset: 0 },
  })
  await repo.moveHead(oid)
}

async function finishRebase(repo: Repo, rb: RebaseState, lines: string[]): Promise<IntegrateOutcome> {
  const newHead = (await repo.headOid())!
  if (rb.headName) {
    const branch = rb.headName.replace('refs/heads/', '')
    await repo.writeBranch(branch, newHead)
    await repo.attachHead(branch)
  }
  await repo.setRebaseState(null)
  await repo.clearOperationState()
  lines.push(`Successfully rebased and updated ${rb.headName ?? 'detached HEAD'}.`)
  return { status: 'ok', lines, commitOid: newHead }
}

export async function continueRebase(repo: Repo, editMessage?: (initial: string) => Promise<string | null>): Promise<IntegrateOutcome> {
  const rb = await repo.getRebaseState()
  if (!rb) throw fatal('No rebase in progress?')
  const conflicts = await repo.getConflicts()
  if (conflicts.length) {
    throw gitErr(
      `Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`,
    )
  }
  if (rb.current) {
    const item = rb.current
    const { commit } = await repo.readCommit(item.oid)
    const treeOid = await writeFlatTree(repo, await readIndex(repo))
    const headTree = await commitTreeOid(repo, (await repo.headOid())!)
    await commitForTodoItem(
      repo,
      rb,
      item,
      treeOid,
      commit.message,
      { name: commit.author.name, email: commit.author.email, timestamp: commit.author.timestamp },
      editMessage,
      treeOid === headTree,
    )
    rb.done.push(item)
    rb.current = null
    await repo.setConflicts([])
    await repo.setRebaseState(rb)
  }
  return runRebase(repo, rb, editMessage)
}

export async function skipRebase(repo: Repo, editMessage?: (initial: string) => Promise<string | null>): Promise<IntegrateOutcome> {
  const rb = await repo.getRebaseState()
  if (!rb) throw fatal('No rebase in progress?')
  const head = (await repo.headOid())!
  await hardCheckoutTree(repo, head)
  await repo.setConflicts([])
  if (rb.current) rb.done.push(rb.current)
  rb.current = null
  await repo.setRebaseState(rb)
  return runRebase(repo, rb, editMessage)
}

export async function abortRebase(repo: Repo): Promise<void> {
  const rb = await repo.getRebaseState()
  if (!rb) throw fatal('No rebase in progress?')
  if (rb.headName) {
    const branch = rb.headName.replace('refs/heads/', '')
    await repo.writeBranch(branch, rb.origHead)
    await repo.attachHead(branch)
  } else {
    await repo.detachHead(rb.origHead)
  }
  await hardCheckoutTree(repo, rb.origHead)
  await repo.setRebaseState(null)
  await repo.clearOperationState()
}

// ---- helpers ------------------------------------------------------------------------------------

export function statLines(stat: { files: number; insertions: number; deletions: number }): string[] {
  if (!stat.files) return []
  const parts = [`${stat.files} file${stat.files === 1 ? '' : 's'} changed`]
  if (stat.insertions) parts.push(`${stat.insertions} insertion${stat.insertions === 1 ? '' : 's'}(+)`)
  if (stat.deletions) parts.push(`${stat.deletions} deletion${stat.deletions === 1 ? '' : 's'}(-)`)
  return [' ' + parts.join(', ')]
}

export { plain }

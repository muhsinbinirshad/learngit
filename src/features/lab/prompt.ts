import type { RepoModel } from './session/LabSession'

/** Branch/state suffix shown in the prompt, e.g. `main`, `(HEAD detached at 1a2b3c4)|MERGING`. */
export function promptBranch(repo: RepoModel): string | null {
  if (!repo.exists || !repo.graph) return null
  const g = repo.graph
  let label = g.head.branch ?? (g.head.oid ? `HEAD detached at ${g.head.oid.slice(0, 7)}` : 'main')
  if (!g.head.oid && g.head.branch) label = g.head.branch
  const st = g.state
  if (st.rebasing) label += '|REBASE'
  else if (st.merging) label += '|MERGING'
  else if (st.cherryPicking) label += '|CHERRY-PICKING'
  else if (st.reverting) label += '|REVERTING'
  else if (st.bisecting) label += '|BISECTING'
  return label
}

/** ANSI prompt for the terminal. */
export function promptText(displayPath: string, branch: string | null): string {
  const b = branch ? ` \x1b[36m(${branch})\x1b[0m` : ''
  return `\x1b[34m${displayPath}\x1b[0m${b}$ `
}

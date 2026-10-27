# Roadmap and status

Commit Lab teaches Git and team collaboration by doing real work inside a fictional company,
**Ledgerly**. This is where the project stands and what's next.

## Done

- **Engine & workspace:** real in-browser Git (isomorphic-git), a shell, a three-pane lab workspace,
  a live commit graph, and a state-based validator. Seed packs load a whole repository snapshot.
- **Ledgerly:** a runnable TypeScript monorepo fixture, a deterministic history generator with planted
  situations, and named seed packs.
- **Real mode:** a backend (GitHub App, encrypted tokens, signed webhooks, repo provisioning,
  GitHub-state validation, bot teammates, lifecycle) that validates labs against real GitHub.
- **Content:** Tracks 1–3 (foundations, branching, first real pull request) and Tracks 4–6
  (history rewriting, recovery and incident response, team workflows), plus badges and progress.

## Tracks

| Track | Focus | Mode |
|-------|-------|------|
| 1 Before you start | What Git is, the core words, how teams work | reading |
| 2 First days at Ledgerly | Setup, commits, staging, history, ignore rules | sandbox |
| 3 Building a feature | Branches, merges, conflicts, stash | sandbox |
| 4 Working on GitHub | Setup, first pull request | real GitHub |
| 5 Tidying history | Interactive rebase, rebase vs merge, cherry-pick | sandbox |
| 6 When things go wrong | Reflog, revert, detached HEAD, bisect, leaked secret | sandbox + real |
| 7 How teams ship | Releases, branch protection, CODEOWNERS, hotfix, GitHub Flow | real GitHub + sandbox |

## Next

- **In-browser history purge:** a sandbox `filter-branch`-style engine operation and a
  `noSecretInHistory` sandbox check, so the leaked-secret lab can also run fully in the browser
  (it currently runs in Real mode, which is where purging and force-with-lease actually happen).
- **Progress sync:** wire the browser's "Check my work" and progress to the backend end to end.
- **Capstones:** multi-step, timed scenarios with bot teammates pulling every track together.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md). Content is data under `src/content/`; the test suite proves
every sandbox lab is completable and validates Real-mode labs against GitHub state.

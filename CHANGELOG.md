# Changelog

All notable changes to Commit Lab are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `seed.packRef` so labs can load Ledgerly seed packs by name, and `applyRebaseTodo` as the pure core behind the rebase editor.
- Track 4: interactive-rebase cleanup of the planted messy branch, and a rebase-vs-merge decision lab.
- Track 5: detached-HEAD recovery, bisecting a planted regression, and a leaked-secret incident lab (rotate, purge, force-with-lease).
- Track 6: cutting a release, landing a change under branch protection with green CI, CODEOWNERS review routing, a release hotfix, and a GitHub Flow discipline lab.
- Real-mode validation for Track 5–6 labs, each covered by passing and failing tests against an in-memory GitHub.

## [0.7.0] - 2026-10-27

### Added
- Ledgerly: a runnable, zero-dependency TypeScript monorepo fixture (shared, api, web) with tests, CI and Docker.
- A deterministic history generator that produces a ~200-commit Ledgerly history with planted situations, plus named seed packs and a GitHub template tree.
- Real-mode backend: GitHub App, encrypted token storage, signed webhooks, repo provisioning, GitHub-state validation, bot teammates and repo lifecycle.
- Lab modes (`sandbox` | `github`) with a pluggable check-provider interface and a real-mode mission panel.
- Tracks 1–3 reframed inside Ledgerly, with Tracks 4–7 covering history rewriting, recovery, releases and real-mode team workflows.
- Badges with a "Real GitHub" indicator, awarded server-side from real GitHub events, with progress synced through the backend.

## [0.1.0] - 2026-10-26

### Added
- Initial Commit Lab: browser-based Git course with a real in-browser Git engine, three-pane lab workspace, live commit graph, state-based validator and the first content tracks.

# Changelog

All notable changes to Commit Lab are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Interactive-rebase lab that cleans the planted messy feature branch, validated by resulting repository state.
- Real-mode team-workflow labs: landing a change under branch protection with green CI, and routing review through CODEOWNERS.
- `seed.packRef` so labs can load Ledgerly seed packs by name, and `applyRebaseTodo` as the pure core behind the rebase editor.

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

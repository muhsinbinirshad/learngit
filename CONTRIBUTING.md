# Contributing to Commit Lab

Thanks for your interest in improving Commit Lab. This guide covers local setup, the test suite, and how
to author new lessons and labs.

## Local setup

Node.js 20+ and pnpm 9+ (`corepack enable` provides pnpm).

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # Vitest: engine, shell, validator, content, server
pnpm typecheck
pnpm lint
pnpm build
```

The Ledgerly fixture runs on its own:

```bash
cd ledgerly && npm install && npm test
```

Regenerate the Ledgerly history and seed packs with `pnpm ledgerly:build`.

## Branching and commits

- Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.
- Keep `main` green: `pnpm test`, `pnpm typecheck` and `pnpm lint` must pass before a pull request merges.

## Authoring content

- **Lesson:** add `src/content/lessons/<id>.json` (sections, takeaways, quiz, optional videos).
- **Lab:** add `src/content/labs/<id>.json` following `src/content/lab.schema.json`. Sandbox labs declare
  `seed.steps` or `seed.packRef`; Real-mode labs set `mode: "github"` with a `realMode` block.
- Register the file in `src/content/index.ts` and place it in the right track in `src/content/tracks.json`.

The test suite seeds every sandbox lab, asserts no objective is met at the start, runs the reference
solution through the real shell, and asserts every objective is met. A lab that cannot be completed fails
the build. Real-mode labs are validated against GitHub state in `src/server` tests.

## Tone

Briefs and debriefs are plain-language but professional — written for people who want to become strong
engineers. Explain the idea, the commands, and what Git did underneath. Avoid filler and hand-holding.

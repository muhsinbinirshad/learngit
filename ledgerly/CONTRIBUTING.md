# Contributing to Ledgerly

## Branching

- `main` is always releasable and protected. No direct pushes.
- Branch from `main`: `feature/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
- Release hardening happens on `release/x.y` branches; only fixes are cherry-picked there.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body: why, not what>
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`. Scope is a package or area
(`shared`, `api`, `web`, `ci`). Keep the subject under 72 characters, imperative mood, no trailing period.

Good: `feat(api): compute tax per line item`
Bad: `fixed stuff`

## Pull requests

1. Open a PR into `main`. Fill in the template.
2. CI must be green (`test`, `typecheck`, `lint`).
3. At least one approval from a code owner (see CODEOWNERS).
4. Squash or rebase — keep history linear on `main`. No merge commits from `main` into your branch; rebase instead.

## Tests

Every behavior change needs a test. Run `npm test` before pushing. Money and date logic in `packages/shared`
is the most load-bearing code in the system — treat its tests as a contract.

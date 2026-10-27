# Security Policy

## Reporting a vulnerability

Email **security@ledgerly.example** (fictional). Do not open a public issue for security problems.
We aim to acknowledge within two business days.

## Secrets

- Secrets (payment keys, database URLs) come from the **environment**, never from source control.
- See `.env.example` for the variables the service reads. Copy it to `.env` locally; `.env` is git-ignored.
- If a secret is ever committed, treat it as compromised: **rotate it immediately**, then purge it from
  history. A leaked key is not "removed" by a follow-up commit — it stays in the git history until the
  history is rewritten.

## Supported versions

We support the latest `1.x` release line with security fixes.

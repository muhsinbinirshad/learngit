# Security Policy

## Reporting a vulnerability

If you find a security issue in Commit Lab, please do not open a public issue. Report it privately through
GitHub's security advisories (Security → Report a vulnerability) on this repository. We aim to acknowledge
reports within a few days.

## Scope and design notes

- **The browser app has no backend and stores nothing remotely.** Repositories live in IndexedDB and progress
  in `localStorage`; nothing is sent anywhere. Clearing site data removes it.
- **Real-mode backend** (`src/server`) handles GitHub credentials. Installation and user tokens are stored
  only on the server, encrypted at rest (AES-256-GCM), and are never sent to the browser. Webhooks are
  verified (`X-Hub-Signature-256`), deduplicated and replay-protected. Lab repos are created in an
  instructor-controlled organization; learners are added as write collaborators only. See
  `src/server/SECURITY.md` for the full threat model, permission justification and token flow.
- **Secrets** come from the environment, never source control. The only key-shaped string in this repository
  is a deliberately fake fixture (`sk_live_FAKE_…`) used by the "leaked key" teaching lab; it is not a real
  credential.

## Supported versions

Commit Lab is pre-1.0 and under active development. Security fixes target the latest `main`.

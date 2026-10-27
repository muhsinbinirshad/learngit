# Commit Lab Real-Mode — Security Review

Real mode runs learners' work on real GitHub. This document is the threat model, the permission
justification, the token flow, and the record of what data we store and why.

## 1. Principles

- **GitHub App, not OAuth App or PATs.** A single App with least-privilege, auditable permissions.
- **Classroom org only.** Lab repos are created in an instructor-controlled organization and named
  `{cohort}-{lab-slug}-{github-username}`. The learner is added as a **write** collaborator — never
  admin. We never create or modify anything in a learner's personal account.
- **Tokens never reach the browser.** Installation and user tokens live only on the server, encrypted
  at rest, short-lived, and are never placed in `localStorage`, `IndexedDB`, cookies readable by JS,
  or any API response.
- **Verify before trust.** Every webhook is signature-verified before its body is parsed.

## 2. Threat model

| Threat | Mitigation |
|--------|------------|
| Stolen token grants repo access | Tokens encrypted at rest (AES-256-GCM); short-lived user tokens with refresh; never sent to the browser. |
| Forged webhook triggers bots/validation | `X-Hub-Signature-256` HMAC verified with `timingSafeEqual` before parsing. Bad signature → 401, no processing. |
| Replayed webhook re-runs side effects | Delivery id (`X-GitHub-Delivery`) deduplicated; a seen id is dropped. Handlers are idempotent. |
| CSRF on sign-in callback | Stateless HMAC `state` parameter, verified on callback. |
| Over-broad App permissions | Least-privilege table below; `checks`/`actions` read-only; `administration` only to set branch protection on repos we create. |
| Privilege escalation via learner repo | Learner is `push` only; branch protection requires PRs + review to land on `main`. |
| Secret leakage in audit/logs | Audit entries store only non-sensitive detail; tokens/secrets are never logged. |
| Abandoned repos linger | Auto-archive on completion and after N days of inactivity; instructor bulk cleanup per cohort. |
| Rate-limit exhaustion | Prefer webhooks over polling; cache reads; back off on 403/429 (operational). |

## 3. Permissions (least privilege, justified)

| Permission | Access | Why |
|------------|--------|-----|
| contents | write | Provision from template; bots push commits (e.g. a conflicting commit to `main`). |
| pull_requests | write | Bots open/review/comment PRs; validation reads PR state. |
| issues | write | Seed lab tickets; bot comments; validation checks issue state + PR references. |
| checks | read | Read CI check-run results (`checkRunPassed`). Never write. |
| actions | read | Read workflow run status for CI-gated labs. Read-only. |
| administration | write | Set branch protection on lab repos we create, in the classroom org only. |
| members | write | Add the learner as a write collaborator on their lab repo. |
| metadata | read | Mandatory baseline repo metadata. |

## 4. Token flow

```
Sign in:
  Browser → GET /auth/github/login
          ← 302 to github.com/login/oauth/authorize?...&state=<hmac>
  Browser → (GitHub) → GET /auth/github/callback?code&state
  Server:  verify state → exchange code (server→GitHub) → encrypt(access,refresh) → store ciphertext
          ← session id only  (token stays server-side)

Act as the App:
  Server: App JWT (RS256, 10 min) → installation token (1 hour) → REST/GraphQL calls
          installation token encrypted at rest; refreshed on expiry

Refresh:
  On use, if user token is within 120s of expiry and a refresh token exists:
  Server→GitHub refresh → re-encrypt → re-store
```

## 5. Data stored, and why

| Data | Why | Notes |
|------|-----|-------|
| user (github login/id, role) | Identify the learner, attribute work | No email stored unless provided |
| cohort | Group learners, set archival policy | — |
| lab_attempt (repo, status, objectives, activity) | Track progress + drive lifecycle | Status: provisioning → in_progress → validated → archived |
| progress | Unlock later tracks | — |
| tokens (ciphertext) | Act on GitHub as the user/App | **Ciphertext only**; plaintext never persisted or logged |
| audit_log | Trace provisioning, validation, bot actions | Non-sensitive detail only |
| webhook deliveries (id, timestamp) | Idempotency + replay protection | Id + time only |

## 6. Tested

`src/server/__tests__/` covers signature verification (valid/invalid/replay), token encryption
(round-trip + tamper detection) and refresh, provisioning (repo naming, write-only collaborator,
branch protection, seeded issues/PRs), the GitHub validation checks, bot reactions, and the full
end-to-end flow (sign-in → provision → push → bot reacts → validate).

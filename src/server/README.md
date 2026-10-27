# Commit Lab — Real-Mode Backend

The server that powers Real-mode (GitHub) labs: sign-in, repo provisioning in the classroom org, the
webhook path (bots + validation), the GitHub check provider, and repo lifecycle. See
[SECURITY.md](./SECURITY.md) for the threat model, permissions and token flow.

## Shape

```
config.ts            environment config (every secret from the environment)
domain/              users, cohorts, lab attempts, progress, audit, tokens — Store interface + memory impl
github/              App (manifest, permissions, JWT), OAuth sign-in, encrypted tokens, webhooks,
                     provisioning, the GitHubClient interface + an in-memory fake for tests
validator/           GitHubProvider + the Real-mode check language (v2 §4)
bots/                bot-teammate engine + scenarios (named fictional engineers, event-triggered)
realmode/            onboarding labs (install Git, identity, auth, Codespaces) + the first-PR lab
lifecycle.ts         archive on completion/inactivity, instructor bulk cleanup
runner.ts            LabRunner — ties it together (the Real-mode lab runner)
api.ts               thin node:http surface over the runner
manifest/            GitHub App manifest for one-click creation
```

## Running

Set the environment (see `config.ts`): `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY` (32 bytes, hex), `CLASSROOM_ORG`,
`TEMPLATE_OWNER`, `TEMPLATE_REPO`, `BASE_URL`. Wire `createHttpServer(runner, config)` to a port.

The production `GitHubClient` is a `fetch`-based implementation of the interface in `github/client.ts`
(issuing App JWTs → installation tokens; calling the REST/GraphQL API). Tests run against
`github/fakeClient.ts`, an in-memory GitHub, so the whole flow is exercised without network.

`Store` has a memory implementation for dev/tests; a production implementation maps the same methods
to Supabase/Postgres tables of the same names.

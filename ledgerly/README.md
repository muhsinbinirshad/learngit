# Ledgerly

**Invoicing for small teams.** Create invoices, track what's due, and get paid — without a spreadsheet.

Ledgerly is a TypeScript monorepo:

| Package | What it is |
|---------|------------|
| `packages/shared` | Domain core: money (integer minor units), dates, invoice types. No framework. |
| `api` | The HTTP service: invoice totals, status transitions, configuration. Depends on `shared`. |
| `web` | The React front end: invoice list and forms. Depends on `shared`. |

## Quick start

Requires **Node 22.6+** (we use the native TypeScript runner — no build step for tests).

```bash
npm install     # links the workspaces; no third-party dependencies
npm test        # runs the unit tests across every package
npm run dev      # starts the API on http://localhost:3000
```

`npm run typecheck` and `npm run lint` fetch their tools on first run (they need network); CI runs them on every pull request.

## Layout

```
packages/shared/src   money.ts · date.ts · types.ts   (+ *.test.ts)
api/src               invoice.ts · status.ts · config.ts · server.ts
web/src               formatInvoice.ts · InvoiceList.tsx · App.tsx
.github/workflows     ci.yml
```

## Money, the one rule

All money is stored as **integer minor units** (cents) with an ISO currency code. Never use floating point
for money. `packages/shared/src/money.ts` is the only place that does money math; everything else goes through it.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming, commit style and the review flow, and
[SECURITY.md](./SECURITY.md) for how we handle secrets. Code owners are listed in [CODEOWNERS](./CODEOWNERS).

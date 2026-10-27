import { Card, Chip, Eyebrow, Icon, Markdown } from '@/design-system/components'
import { ARCHITECTURE, BRANCHING, COMPANY, OWNERSHIP, RELEASES, TEAM, type TeamMember } from '@/content/ledgerly/company'

const TEAM_TONE: Record<TeamMember['team'], 'primary' | 'success' | 'neutral' | 'warning'> = {
  Domain: 'primary',
  Backend: 'success',
  Frontend: 'warning',
  Platform: 'neutral',
  Engineering: 'neutral',
}

export function LedgerlyPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8">
        <Eyebrow>Welcome to the company</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-on-surface">{COMPANY.name}</h1>
        <p className="mt-1 text-lg text-on-surface-variant">{COMPANY.tagline}</p>
        <div className="mt-4 max-w-2xl text-sm leading-6 text-on-surface-variant">
          <Markdown text={COMPANY.mission} />
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          Ledgerly is fictional. Every lab in this course is a day on the job here — you will work in this codebase,
          with this team, by their rules.
        </p>
      </header>

      <Section icon="groups" title="The team" subtitle="Who you will be working with, and who owns what.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((m) => (
            <Card key={m.handle} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {initials(m.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-on-surface">{m.name}</p>
                  <p className="truncate text-xs text-on-surface-variant">{m.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Chip tone={TEAM_TONE[m.team]}>{m.team}</Chip>
                <code className="font-mono text-xs text-on-surface-variant">@{m.handle}</code>
              </div>
              <p className="text-xs leading-5 text-on-surface-variant">{m.focus}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section icon="account_tree" title="Architecture" subtitle="One TypeScript monorepo. The web app and the API both build on a shared domain core.">
        <ArchitectureDiagram />
      </Section>

      <Section icon="alt_route" title="How we branch and ship" subtitle="The rules that keep main releasable.">
        <ol className="flex flex-col gap-3">
          {BRANCHING.map((b, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-outline text-xs font-medium text-on-surface-variant">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-on-surface">
                  <Markdown text={b.title} />
                </p>
                <div className="text-sm leading-6 text-on-surface-variant">
                  <Markdown text={b.detail} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon="shield_person" title="Who owns what" subtitle="From CODEOWNERS. A review from the matching owner is required to merge.">
        <Card padded={false} className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline bg-surface text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="px-4 py-2 font-medium">Path</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Why</th>
              </tr>
            </thead>
            <tbody>
              {OWNERSHIP.map((o) => (
                <tr key={o.pattern} className="border-b border-outline-variant last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-on-surface">{o.pattern}</td>
                  <td className="px-4 py-2 font-mono text-xs text-primary">{o.owner}</td>
                  <td className="hidden px-4 py-2 text-xs text-on-surface-variant sm:table-cell">{o.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section icon="sell" title="Release history" subtitle="Where the codebase is today, and how it got here.">
        <ul className="flex flex-col gap-2">
          {RELEASES.map((r) => (
            <li key={r.tag} className="flex items-baseline gap-3 rounded-md border border-outline bg-background px-3 py-2">
              <code className="font-mono text-xs font-medium text-primary">{r.tag}</code>
              <span className="text-xs text-on-surface-variant">{r.date}</span>
              <span className="text-sm text-on-surface">{r.summary}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function Section({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="flex items-center gap-2 text-lg font-medium text-on-surface">
        <Icon name={icon} size={20} className="text-primary" /> {title}
      </h2>
      <p className="mb-4 mt-1 text-sm text-on-surface-variant">{subtitle}</p>
      {children}
    </section>
  )
}

function ArchitectureDiagram() {
  const consumers = ARCHITECTURE.filter((p) => p.dependsOn.length > 0)
  const core = ARCHITECTURE.find((p) => p.dependsOn.length === 0)!
  return (
    <div className="rounded-lg border border-outline bg-surface p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {consumers.map((p) => (
          <PackageBox key={p.id} pkg={p} />
        ))}
      </div>
      <div className="my-3 flex items-center justify-center gap-2 text-on-surface-variant" aria-hidden>
        <Icon name="south" size={18} />
        <span className="text-xs">depends on</span>
        <Icon name="south" size={18} />
      </div>
      <PackageBox pkg={core} emphasis />
    </div>
  )
}

function PackageBox({ pkg, emphasis }: { pkg: (typeof ARCHITECTURE)[number]; emphasis?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${emphasis ? 'border-primary bg-primary/10' : 'border-outline bg-background'}`}>
      <div className="flex items-center gap-2">
        <Icon name="deployed_code" size={16} className={emphasis ? 'text-primary' : 'text-on-surface-variant'} />
        <code className="font-mono text-sm font-medium text-on-surface">@ledgerly/{pkg.title}</code>
        <span className="ml-auto font-mono text-[11px] text-on-surface-variant">{pkg.path}</span>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-on-surface-variant">{pkg.description}</p>
    </div>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

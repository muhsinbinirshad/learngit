import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  InlineMessage,
  Kbd,
  Markdown,
  Menu,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonText,
  Spinner,
  SplitPane,
  Switch,
  Tabs,
  TextArea,
  TextField,
  Tooltip,
  snackbar,
} from '@/design-system/components'
import { Eyebrow } from '@/design-system/components'

const TOKENS = {
  colors: [
    ['background', '#FFFFFF'],
    ['surface', '#F8F9FA'],
    ['surface-variant', '#F1F3F4'],
    ['on-surface', '#202124'],
    ['on-surface-variant', '#5F6368'],
    ['outline', '#DADCE0'],
    ['primary', '#1A73E8'],
    ['primary-container', '#E8F0FE'],
    ['success', '#188038'],
    ['warning', '#F9AB00'],
    ['error', '#D93025'],
  ],
  type: [
    ['xs', '12 / 16'],
    ['sm', '14 / 20'],
    ['base', '16 / 24'],
    ['lg', '20 / 28'],
    ['xl', '24 / 32'],
    ['2xl', '32 / 40'],
  ],
}

/** Internal style guide: every component in every state. Not linked from product navigation. */
export function DesignPage() {
  const [dialog, setDialog] = useState(false)
  const [strict, setStrict] = useState(false)
  const [tab, setTab] = useState('brief')
  const [seg, setSeg] = useState<'terminal' | 'ui'>('terminal')
  const [checked, setChecked] = useState(true)
  const [sw, setSw] = useState(true)
  const [select, setSelect] = useState('main')

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-8">
      <Eyebrow>Internal · design system</Eyebrow>
      <h1 className="mt-2 text-2xl font-medium leading-10">Commit Lab components</h1>
      <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
        Every component with its states, built on the tokens in tokens.css. Tab through the page: every interactive element shows a visible focus ring.
      </p>

      <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-2">
        {['tokens', 'buttons', 'inputs', 'selection', 'navigation', 'feedback', 'containers', 'layout'].map((s) => (
          <a
            key={s}
            href={`#${s}`}
            className="rounded-full border border-outline px-3 py-1 font-mono text-xs text-on-surface-variant hover:bg-surface-variant hover:text-on-surface hover:no-underline"
          >
            {s}
          </a>
        ))}
      </nav>

      <Section id="tokens" title="Tokens">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Eyebrow>Color roles</Eyebrow>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {TOKENS.colors.map(([name, hex]) => (
                <li key={name} className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded-md border border-outline" style={{ background: `var(--color-${name})` }} aria-hidden />
                  <span className="font-mono text-xs">
                    {name}
                    <span className="block text-on-surface-variant">{hex}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Eyebrow>Type scale (Inter / JetBrains Mono)</Eyebrow>
            <ul className="mt-3 flex flex-col gap-2">
              {TOKENS.type.map(([name, size]) => (
                <li key={name} className={`text-${name} flex items-baseline gap-4`}>
                  <span className="w-28 font-mono text-xs text-on-surface-variant">
                    {name} · {size}
                  </span>
                  <span>Ship the hotfix before standup</span>
                </li>
              ))}
            </ul>
            <Eyebrow className="mt-6">Spacing · radii · elevation</Eyebrow>
            <div className="mt-3 flex items-end gap-2">
              {[4, 8, 12, 16, 24, 32].map((n) => (
                <span key={n} className="flex flex-col items-center gap-1 font-mono text-[10px] text-on-surface-variant">
                  <span className="bg-primary-container" style={{ width: n, height: n }} aria-hidden />
                  {n}
                </span>
              ))}
              <span role="img" className="ml-4 h-8 w-8 rounded-md bg-surface-variant" aria-label="radius 8" />
              <span role="img" className="h-8 w-8 rounded-lg bg-surface-variant" aria-label="radius 12" />
              <span role="img" className="ml-4 h-8 w-8 rounded-md bg-background shadow-1" aria-label="elevation 1" />
              <span role="img" className="h-8 w-8 rounded-md bg-background shadow-2" aria-label="elevation 2" />
            </div>
          </div>
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <Row label="Variants">
          <Button>Filled</Button>
          <Button variant="tonal">Tonal</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="text">Text</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row label="With icons, sizes">
          <Button icon="add">Create branch</Button>
          <Button trailingIcon="arrow_forward" variant="tonal">
            Next
          </Button>
          <Button size="sm">Small</Button>
          <Button size="sm" variant="outlined" icon="save">
            Save
          </Button>
        </Row>
        <Row label="Loading, disabled">
          <Button loading>Committing</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outlined" disabled>
            Disabled
          </Button>
          <Button variant="text" disabled>
            Disabled
          </Button>
        </Row>
        <Row label="Icon buttons">
          <IconButton icon="undo" label="Undo" />
          <IconButton icon="settings" label="Settings" variant="tonal" />
          <IconButton icon="close" label="Close" variant="outlined" />
          <IconButton icon="push_pin" label="Pinned" active />
          <IconButton icon="delete" label="Delete" disabled />
          <IconButton icon="search" label="Search" size="sm" />
        </Row>
      </Section>

      <Section id="inputs" title="Inputs">
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          <TextField label="Branch name" placeholder="feature/short-name" hint="Lowercase, slashes allowed." />
          <TextField label="Commit subject" defaultValue="Add CSV export module" />
          <TextField label="Email" defaultValue="not-an-email" error="Enter a valid email address." />
          <TextField label="Disabled" value="read only" disabled readOnly />
          <TextArea label="Commit message" placeholder="Subject line, then an optional body after a blank line" />
          <Select
            label="Base branch"
            options={[
              { value: 'main', label: 'main' },
              { value: 'release/2.1', label: 'release/2.1' },
              { value: 'archived', label: 'archived (disabled)', disabled: true },
            ]}
            value={select}
            onChange={(e) => setSelect(e.target.value)}
            hint="Where the merge lands."
          />
          <Select
            label="Reviewer"
            options={[
              { value: 'mei', label: 'Mei Lin' },
              { value: 'jonas', label: 'Jonas Weber' },
            ]}
            placeholder="Choose a reviewer"
            defaultValue=""
            error="A reviewer is required."
          />
          <Select label="Disabled" options={[{ value: 'x', label: 'Locked' }]} disabled defaultValue="x" />
        </div>
      </Section>

      <Section id="selection" title="Selection controls">
        <div className="grid max-w-3xl gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Checkbox label="Stage this file" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <Checkbox label="Include untracked files" description="Equivalent to git stash -u" defaultChecked={false} />
            <Checkbox label="Partially selected" indeterminate readOnly checked={false} />
            <Checkbox label="Disabled" disabled defaultChecked />
            <Checkbox label="With error" error="Pick at least one file." defaultChecked={false} />
          </div>
          <div className="flex flex-col gap-4">
            <Switch label="Reduce motion" description="Disables panel transitions" checked={sw} onChange={setSw} />
            <Switch label="Off state" checked={false} onChange={() => undefined} />
            <Switch label="Disabled" checked disabled onChange={() => undefined} />
            <div className="flex items-center gap-3">
              <SegmentedControl
                ariaLabel="Mode"
                value={seg}
                onChange={setSeg}
                options={[
                  { value: 'terminal', label: 'Terminal', icon: 'terminal' },
                  { value: 'ui', label: 'UI', icon: 'dashboard_customize' },
                ]}
              />
              <SegmentedControl
                ariaLabel="View"
                size="md"
                value="list"
                onChange={() => undefined}
                options={[
                  { value: 'list', label: 'List' },
                  { value: 'grid', label: 'Grid' },
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section id="navigation" title="Navigation">
        <Row label="Tabs (arrow keys, Home/End)">
          <Tabs
            ariaLabel="Lab sections"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'brief', label: 'Brief', icon: 'description' },
              { id: 'objectives', label: 'Objectives', icon: 'flag' },
              { id: 'debrief', label: 'Debrief', dirty: true },
            ]}
            className="w-full"
          />
        </Row>
        <Row label="Menu, tooltip, kbd">
          <Menu
            label="Lab actions"
            trigger={(p) => (
              <Button variant="outlined" trailingIcon="expand_more" {...p}>
                Actions
              </Button>
            )}
            items={[
              { id: 'a', label: 'View debrief', icon: 'summarize', onSelect: () => snackbar({ tone: 'info', title: 'Debrief opened' }) },
              { id: 'b', label: 'Disabled item', icon: 'lock', disabled: true, onSelect: () => undefined },
              {
                id: 'c',
                label: 'Reset lab',
                description: 'Discards all work',
                icon: 'restart_alt',
                danger: true,
                onSelect: () => snackbar({ tone: 'error', title: 'Lab reset' }),
              },
            ]}
          />
          <Tooltip content="Explains the control on hover or focus">
            <Button variant="text">Hover or focus me</Button>
          </Tooltip>
          <span className="inline-flex items-center gap-1 text-sm text-on-surface-variant">
            Save <Kbd>Ctrl</Kbd>
            <Kbd>S</Kbd>
          </span>
        </Row>
      </Section>

      <Section id="feedback" title="Feedback">
        <Row label="Chips and badges">
          <Chip>Neutral</Chip>
          <Chip tone="primary" icon="commit">
            Primary
          </Chip>
          <Chip tone="success" icon="check">
            Complete
          </Chip>
          <Chip tone="warning" icon="schedule">
            Pending
          </Chip>
          <Chip tone="error" icon="error">
            Conflict
          </Chip>
          <Chip mono>feature/csv-export</Chip>
          <Badge content={3} label="3 unread">
            <IconButton icon="notifications" label="Notifications" />
          </Badge>
          <Badge content={120} label="120 commands">
            <IconButton icon="terminal" label="Commands" />
          </Badge>
          <Badge label="Attention needed" tone="error">
            <IconButton icon="account_tree" label="Repository" />
          </Badge>
          <Badge content="new" tone="neutral" label="New" />
        </Row>
        <Row label="Progress">
          <ProgressBar value={2} max={5} label="Objectives" className="w-40" />
          <ProgressBar value={5} max={5} label="Complete" size="md" className="w-40" />
          <CircularProgress value={0.4} label="Track 40%" />
          <CircularProgress value={1} label="Track complete" />
          <CircularProgress label="Loading" />
          <Spinner label="Loading" />
        </Row>
        <Row label="Skeletons">
          <Skeleton className="h-8 w-40" label="Loading title" />
          <SkeletonText className="w-64" />
        </Row>
        <div className="grid gap-3 md:grid-cols-2">
          <InlineMessage tone="info" title="Resumed session">
            Your files and history are exactly as you left them.
          </InlineMessage>
          <InlineMessage
            tone="success"
            title="All objectives complete"
            action={
              <Button size="sm" variant="tonal">
                Debrief
              </Button>
            }
          />
          <InlineMessage tone="warning" title="Merge in progress">
            Conflicts resolved; run `git commit` to finish.
          </InlineMessage>
          <InlineMessage tone="error" title="Push rejected">
            The remote contains work you do not have locally.
          </InlineMessage>
        </div>
        <Row label="Snackbar and dialog">
          <Button variant="outlined" onClick={() => snackbar({ tone: 'success', title: 'Commit recorded', description: '[main 1a2b3c4] Add CSV export' })}>
            Show snackbar
          </Button>
          <Button
            variant="outlined"
            onClick={() => snackbar({ tone: 'error', title: 'Could not switch branch', action: { label: 'Retry', onClick: () => undefined } })}
          >
            Snackbar with action
          </Button>
          <Button variant="outlined" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
          <Button variant="outlined" onClick={() => setStrict(true)}>
            Strict dialog
          </Button>
        </Row>
      </Section>

      <Section id="containers" title="Containers">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title="Default card" description="Border only, no shadow." actions={<IconButton icon="more_vert" label="More" />} />
            <Markdown text={'Supports **bold**, `code` and lists:\n\n- objective one\n- objective two'} />
          </Card>
          <Card elevated>
            <CardHeader title="Elevated card" description="Elevation level 1 for primary actions." />
            <EmptyState
              compact
              icon="inbox"
              title="Nothing here yet"
              description="Compact empty state inside a card."
              action={
                <Button size="sm" variant="tonal">
                  Add
                </Button>
              }
            />
          </Card>
        </div>
        <div className="mt-4 rounded-lg border border-outline bg-background">
          <EmptyState
            icon="account_tree"
            title="No repository yet"
            description="Full-size empty state with guidance and a primary action."
            action={<Button icon="add">Initialize repository</Button>}
          />
        </div>
      </Section>

      <Section id="layout" title="Layout">
        <div className="h-56 overflow-hidden rounded-lg border border-outline">
          <SplitPane direction="horizontal" initial={[0.3, 0.7]} minPx={120} labels={['Left pane', 'Right pane']}>
            <div className="h-full bg-surface p-3 text-sm text-on-surface-variant">
              Resizable: drag the divider, or focus it and use arrow keys (Shift for larger steps).
            </div>
            <div className="h-full p-3 text-sm text-on-surface-variant">Pane sizes persist per storage key.</div>
          </SplitPane>
        </div>
      </Section>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Reset this lab?"
        description="Files, commits and objective progress for this lab will be discarded."
        size="sm"
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon="restart_alt" onClick={() => setDialog(false)}>
              Reset lab
            </Button>
          </>
        }
      />
      <Dialog
        open={strict}
        onClose={() => setStrict(false)}
        strict
        title="Choose how to continue"
        description="Strict dialogs ignore Escape and backdrop clicks; an explicit choice is required."
        size="sm"
        actions={
          <>
            <Button variant="outlined" onClick={() => setStrict(false)}>
              Keep changes
            </Button>
            <Button onClick={() => setStrict(false)}>Discard</Button>
          </>
        }
      />
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-12 scroll-mt-20">
      <h2 id={`${id}-h`} className="mb-4 border-b border-outline pb-2 text-lg font-medium">
        {title}
      </h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

export { Icon }

import { Link } from 'react-router-dom'
import type { LabDefinition, TrackDefinition } from '@/engine/scenario/types'
import { Button, Icon, IconButton, Menu, ProgressBar, SegmentedControl } from '@/design-system/components'
import { Wordmark } from '@/app/AppShell'

export type WorkMode = 'terminal' | 'ui'

interface Props {
  lab: LabDefinition
  track: TrackDefinition
  met: number
  mode: WorkMode
  onMode: (m: WorkMode) => void
  canUndo: boolean
  busy: boolean
  onUndo: () => void
  onReset: () => void
  onDebrief: () => void
  complete: boolean
  missionCollapsed: boolean
  graphCollapsed: boolean
  onToggleMission: () => void
  onToggleGraph: () => void
}

export function LabToolbar({
  lab,
  track,
  met,
  mode,
  onMode,
  canUndo,
  busy,
  onUndo,
  onReset,
  onDebrief,
  complete,
  missionCollapsed,
  graphCollapsed,
  onToggleMission,
  onToggleGraph,
}: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-outline bg-background px-4" role="banner">
      <Wordmark />
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-on-surface-variant md:flex">
        <Link to={`/tracks/${track.id}`} className="shrink-0 text-on-surface-variant hover:text-on-surface">
          {track.title}
        </Link>
        <Icon name="chevron_right" size={16} aria-hidden />
        <span className="truncate text-on-surface" aria-current="page">
          {lab.title}
        </span>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 lg:flex" aria-live="polite">
          <ProgressBar value={met} max={lab.objectives.length} label="Objectives completed" className="w-24" />
          <span className="text-xs text-on-surface-variant">
            {met}/{lab.objectives.length}
          </span>
        </div>
        <SegmentedControl
          ariaLabel="Work mode"
          value={mode}
          onChange={onMode}
          options={[
            { value: 'terminal', label: 'Terminal', icon: 'terminal' },
            { value: 'ui', label: 'UI', icon: 'dashboard_customize' },
          ]}
        />
        <div className="flex items-center gap-1">
          <IconButton icon="undo" label="Undo last step" onClick={onUndo} disabled={!canUndo || busy} />
          <IconButton
            icon="left_panel_close"
            label={missionCollapsed ? 'Show mission panel' : 'Hide mission panel'}
            onClick={onToggleMission}
            active={missionCollapsed}
          />
          <IconButton
            icon="right_panel_close"
            label={graphCollapsed ? 'Show graph panel' : 'Hide graph panel'}
            onClick={onToggleGraph}
            active={graphCollapsed}
          />
          <Menu
            label="Lab actions"
            align="right"
            trigger={(p) => <IconButton icon="more_vert" label="More lab actions" {...p} />}
            items={[
              {
                id: 'debrief',
                label: complete ? 'View debrief' : 'Debrief (available when complete)',
                icon: 'summarize',
                disabled: !complete,
                onSelect: onDebrief,
              },
              {
                id: 'reset',
                label: 'Reset lab',
                description: 'Discard all work and start from the seeded repository',
                icon: 'restart_alt',
                danger: true,
                onSelect: onReset,
              },
            ]}
          />
        </div>
        {complete && (
          <Button size="sm" icon="summarize" onClick={onDebrief}>
            Debrief
          </Button>
        )}
      </div>
    </header>
  )
}

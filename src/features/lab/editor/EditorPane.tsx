import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { listFilesRecursive, relative } from '@/engine/fs'
import type { LabSession, SessionState } from '../session/LabSession'
import { Button, EmptyState, Icon, IconButton, InlineMessage, Tabs, Kbd } from '@/design-system/components'
import { cn } from '@/design-system/cn'
import { setupMonaco, languageFor, monaco } from './monacoSetup'
import { parseConflicts, resolveConflict, resolveAll, type Resolution } from './conflicts'

setupMonaco()

interface Props {
  session: LabSession
  state: SessionState
  openFiles: string[]
  activeFile: string | null
  onOpen: (path: string) => void
  onClose: (path: string) => void
  onActivate: (path: string) => void
  onFocusTerminal: () => void
}

const EDITOR_OPTIONS: MonacoEditor.IStandaloneEditorConstructionOptions = {
  fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  padding: { top: 8 },
  fixedOverflowWidgets: true,
  'semanticHighlighting.enabled': false,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  occurrencesHighlight: 'off',
  renderWhitespace: 'none',
  guides: { indentation: false },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
}

/** Tabbed Monaco editor with a file tree, conflict resolution and the shell's editor requests. */
export function EditorPane({ session, state, openFiles, activeFile, onOpen, onClose, onActivate, onFocusTerminal }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [treeOpen, setTreeOpen] = useState(true)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [request, setRequest] = useState<{ source: SessionState['pendingEditor']; text: string }>({ source: null, text: '' })
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const repoDir = session.repoDir
  const pending = state.pendingEditor

  // File tree refresh after any shell/editor change.
  useEffect(() => {
    let cancelled = false
    listFilesRecursive(session.fs, repoDir, true).then((list) => {
      if (!cancelled) setFiles(list.map((f) => relative(repoDir, f)))
    })
    return () => {
      cancelled = true
    }
  }, [session, repoDir, state.repo, state.terminal.length])

  // Load file contents when opened or when the shell changed them.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, string> = {}
      const nextSaved: Record<string, string> = {}
      for (const path of openFiles) {
        const text = await session.readFile(path)
        if (text === null) continue
        nextSaved[path] = text
        // Keep unsaved edits unless the file changed on disk underneath.
        next[path] = contents[path] !== undefined && saved[path] !== undefined && saved[path] === text ? contents[path]! : text
      }
      if (!cancelled) {
        setSaved(nextSaved)
        setContents(next)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFiles, state.repo, state.terminal.length, session])

  // Reset the request draft when a new editor request arrives (derived state, no effect).
  if (request.source !== pending) setRequest({ source: pending, text: pending?.content ?? '' })
  const requestText = request.text
  const setRequestText = (text: string) => setRequest({ source: pending, text })

  const dirty = (path: string) => contents[path] !== undefined && saved[path] !== undefined && contents[path] !== saved[path]

  const save = useCallback(
    async (path: string) => {
      const text = contents[path]
      if (text === undefined) return
      await session.writeFile(path, text)
      setSaved((s) => ({ ...s, [path]: text }))
    },
    [contents, session],
  )

  const onMount: OnMount = (ed) => {
    editorRef.current = ed
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (pending) submitRequest(true)
      else if (activeFile) void save(activeFile)
    })
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backquote, () => onFocusTerminal())
  }

  const submitRequest = (ok: boolean) => {
    if (!pending) return
    pending.resolve(ok ? requestText : null)
  }

  const conflicts = useMemo(() => (activeFile && contents[activeFile] ? parseConflicts(contents[activeFile]!) : []), [activeFile, contents])

  const applyResolution = (index: number | 'all', res: Resolution) => {
    if (!activeFile) return
    const text = contents[activeFile] ?? ''
    const next = index === 'all' ? resolveAll(text, res) : resolveConflict(text, index, res)
    setContents((c) => ({ ...c, [activeFile]: next }))
  }

  const tabs = openFiles.map((f) => ({
    id: f,
    label: relative(repoDir, f),
    dirty: dirty(f),
    trailing: (
      <IconButton
        icon="close"
        label={`Close ${relative(repoDir, f)}`}
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onClose(f)
        }}
      />
    ),
  }))

  const tree = useMemo(() => buildTree(files), [files])

  return (
    <div className="flex h-full min-h-0">
      {/* File tree */}
      <aside
        className={cn('flex shrink-0 flex-col border-r border-outline bg-surface transition-[width] duration-base', treeOpen ? 'w-52' : 'w-9')}
        aria-label="Project files"
      >
        <div className="flex h-8 items-center justify-between border-b border-outline px-1">
          {treeOpen && <span className="px-2 text-xs font-medium text-on-surface-variant">{session.lab.workspace.projectDir}</span>}
          <IconButton
            icon={treeOpen ? 'left_panel_close' : 'left_panel_open'}
            label={treeOpen ? 'Collapse file tree' : 'Expand file tree'}
            size="sm"
            onClick={() => setTreeOpen((o) => !o)}
          />
        </div>
        {treeOpen && (
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {files.length === 0 ? (
              <p className="px-3 py-2 text-xs text-on-surface-variant">
                No files yet. Create one in the terminal, for example <code className="font-mono">{'echo "text" > notes.md'}</code>.
              </p>
            ) : (
              <TreeView
                node={tree}
                depth={0}
                onOpen={(rel) => onOpen(`${repoDir}/${rel}`)}
                activeRel={activeFile ? relative(repoDir, activeFile) : null}
                status={state.repo.status}
              />
            )}
          </div>
        )}
      </aside>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {pending ? (
          <div className="flex h-full flex-col">
            <div className="flex h-10 items-center justify-between gap-3 border-b border-outline bg-primary-container px-3">
              <div className="flex min-w-0 items-center gap-2 text-sm text-on-primary-container">
                <Icon name="edit_note" size={18} />
                <span className="font-medium">{pending.title}</span>
                <span className="truncate text-xs">{pending.help}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="text" onClick={() => submitRequest(false)}>
                  Cancel
                </Button>
                <Button size="sm" icon="check" onClick={() => submitRequest(true)}>
                  Save and continue
                </Button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              <Editor
                className="monaco-host"
                theme="commitlab-light"
                language={pending.language ?? 'git-commit'}
                value={requestText}
                onChange={(v) => setRequestText(v ?? '')}
                options={{ ...EDITOR_OPTIONS, lineNumbers: 'off', glyphMargin: false, folding: false }}
                onMount={onMount}
                loading={<EditorLoading />}
              />
            </div>
          </div>
        ) : openFiles.length === 0 ? (
          <EmptyState
            icon="description"
            title="No file open"
            description={
              <>
                Pick a file from the tree, or run <code className="rounded-sm bg-surface-variant px-1 font-mono text-xs">{'code <file>'}</code> in the terminal.
              </>
            }
            className="h-full"
          />
        ) : (
          <>
            <div className="flex h-10 shrink-0 items-center border-b border-outline bg-surface pr-2">
              <Tabs
                items={tabs}
                value={activeFile ?? openFiles[0]!}
                onChange={onActivate}
                ariaLabel="Open files"
                size="sm"
                className="min-w-0 flex-1 overflow-x-auto border-b-0"
              />
              {activeFile && (
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <span className="hidden text-xs text-on-surface-variant xl:inline-flex xl:items-center xl:gap-1">
                    <Kbd>Ctrl</Kbd>
                    <Kbd>S</Kbd>
                  </span>
                  <Button size="sm" variant={dirty(activeFile) ? 'filled' : 'text'} icon="save" onClick={() => save(activeFile)} disabled={!dirty(activeFile)}>
                    Save
                  </Button>
                </div>
              )}
            </div>
            {activeFile && conflicts.length > 0 && (
              <ConflictBar blocks={conflicts.length} onResolve={applyResolution} ours={conflicts[0]!.oursLabel} theirs={conflicts[0]!.theirsLabel} />
            )}
            <div className="relative min-h-0 flex-1">
              {activeFile && contents[activeFile] !== undefined ? (
                <Editor
                  key={activeFile}
                  className="monaco-host"
                  theme="commitlab-light"
                  path={activeFile}
                  language={languageFor(activeFile)}
                  value={contents[activeFile]}
                  onChange={(v) => setContents((c) => ({ ...c, [activeFile]: v ?? '' }))}
                  options={EDITOR_OPTIONS}
                  onMount={onMount}
                  loading={<EditorLoading />}
                />
              ) : (
                <EditorLoading />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EditorLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-on-surface-variant" role="status">
      Loading editor…
    </div>
  )
}

function ConflictBar({
  blocks,
  onResolve,
  ours,
  theirs,
}: {
  blocks: number
  onResolve: (index: number | 'all', res: Resolution) => void
  ours: string
  theirs: string
}) {
  return (
    <InlineMessage tone="warning" className="m-2" title={`${blocks} conflict${blocks === 1 ? '' : 's'} in this file`}>
      <p className="text-xs">
        Current = <code className="font-mono">{ours || 'HEAD'}</code>, incoming = <code className="font-mono">{theirs || 'other branch'}</code>. Resolve the
        first block, or all at once, then edit as needed and save.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outlined" onClick={() => onResolve(0, 'ours')}>
          Accept current
        </Button>
        <Button size="sm" variant="outlined" onClick={() => onResolve(0, 'theirs')}>
          Accept incoming
        </Button>
        <Button size="sm" variant="outlined" onClick={() => onResolve(0, 'both')}>
          Accept both
        </Button>
        {blocks > 1 && (
          <>
            <span className="self-center text-xs text-on-warning-container">All:</span>
            <Button size="sm" variant="text" onClick={() => onResolve('all', 'ours')}>
              current
            </Button>
            <Button size="sm" variant="text" onClick={() => onResolve('all', 'theirs')}>
              incoming
            </Button>
            <Button size="sm" variant="text" onClick={() => onResolve('all', 'both')}>
              both
            </Button>
          </>
        )}
      </div>
    </InlineMessage>
  )
}

interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  isFile: boolean
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [], isFile: false }
  for (const f of files) {
    const parts = f.split('/')
    let node = root
    parts.forEach((p, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let child = node.children.find((c) => c.name === p)
      if (!child) {
        child = { name: p, path, children: [], isFile: i === parts.length - 1 }
        node.children.push(child)
      }
      node = child
    })
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name))
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

function TreeView({
  node,
  depth,
  onOpen,
  activeRel,
  status,
}: {
  node: TreeNode
  depth: number
  onOpen: (rel: string) => void
  activeRel: string | null
  status: SessionState['repo']['status']
}) {
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} aria-label={depth === 0 ? 'Files' : undefined}>
      {node.children.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth} onOpen={onOpen} activeRel={activeRel} status={status} />
      ))}
    </ul>
  )
}

function TreeItem({
  node,
  depth,
  onOpen,
  activeRel,
  status,
}: {
  node: TreeNode
  depth: number
  onOpen: (rel: string) => void
  activeRel: string | null
  status: SessionState['repo']['status']
}) {
  const [open, setOpen] = useState(true)
  const entry = status?.entries.find((e) => e.path === node.path)
  const marker = entry?.conflicted ? 'C' : entry?.untracked ? 'U' : entry?.staged === 'added' ? 'A' : entry?.unstaged || entry?.staged ? 'M' : null
  const markerTone = marker === 'C' ? 'text-error' : marker === 'U' ? 'text-success' : marker === 'A' ? 'text-success' : 'text-warning'
  return (
    <li role="treeitem" aria-expanded={node.isFile ? undefined : open} aria-selected={node.isFile && node.path === activeRel}>
      <button
        type="button"
        className={cn(
          'flex h-7 w-full items-center gap-1.5 pr-2 text-left text-xs hover:bg-surface-variant',
          node.path === activeRel && 'bg-primary-container text-on-primary-container',
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => (node.isFile ? onOpen(node.path) : setOpen((o) => !o))}
      >
        <Icon name={node.isFile ? 'draft' : open ? 'folder_open' : 'folder'} size={16} className="text-on-surface-variant" />
        <span className="truncate">{node.name}</span>
        {marker && <span className={cn('ml-auto font-mono text-[11px] font-medium', markerTone)}>{marker}</span>}
      </button>
      {!node.isFile && open && <TreeView node={node} depth={depth + 1} onOpen={onOpen} activeRel={activeRel} status={status} />}
    </li>
  )
}

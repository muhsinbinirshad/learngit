import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { LabSession, SessionState } from '../session/LabSession'
import type { RunResult } from '@/engine/shell/types'
import { LineEditor } from './lineEditor'
import { complete, commonPrefix } from './completion'
import { promptBranch, promptText } from '../prompt'
import { Icon } from '@/design-system/components'
import { usePreferences } from '@/features/placeholders/preferences'

interface Props {
  session: LabSession
  state: SessionState
  onRun: (line: string) => Promise<RunResult | undefined>
  focusSignal?: number
}

const THEME = {
  background: '#202124',
  foreground: '#e8eaed',
  cursor: '#e8eaed',
  cursorAccent: '#202124',
  selectionBackground: 'rgba(138, 180, 248, 0.35)',
  black: '#202124',
  red: '#f28b82',
  green: '#81c995',
  yellow: '#fdd663',
  blue: '#8ab4f8',
  magenta: '#c58af9',
  cyan: '#78d9ec',
  white: '#e8eaed',
  brightBlack: '#9aa0a6',
  brightRed: '#f6aea9',
  brightGreen: '#a8dab5',
  brightYellow: '#fde293',
  brightBlue: '#aecbfa',
  brightMagenta: '#d7aefb',
  brightCyan: '#a1e4f2',
  brightWhite: '#ffffff',
}

/** xterm.js terminal wired to the lab shell with a readline-style line editor. */
export function TerminalPane({ session, state, onRun, focusSignal }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const editorRef = useRef(new LineEditor())
  const printedRef = useRef(0)
  const stateRef = useRef(state)
  const onRunRef = useRef(onRun)
  const sessionRef = useRef(session)
  useEffect(() => {
    stateRef.current = state
    onRunRef.current = onRun
    sessionRef.current = session
  })

  const currentPrompt = () => {
    const s = stateRef.current
    if (s.prompt) return s.prompt
    return promptText(s.displayPath, promptBranch(s.repo))
  }

  const renderLine = () => {
    const term = termRef.current
    if (!term) return
    const ed = editorRef.current
    const prompt = currentPrompt()
    // Clear line, write prompt + buffer, then position the cursor.
    term.write(`\r\x1b[K${prompt}${ed.buffer}`)
    const back = ed.buffer.length - ed.cursor
    if (back > 0) term.write(`\x1b[${back}D`)
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: usePreferences.getState().terminalFontSize,
      lineHeight: 1.3,
      theme: THEME,
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
      scrollback: 3000,
      allowTransparency: false,
      screenReaderMode: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    editorRef.current = new LineEditor(sessionRef.current.shell.history.map((h) => h.input))
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* host hidden */
      }
    })
    ro.observe(host)
    requestAnimationFrame(() => fit.fit())

    // Print existing transcript and prompt.
    for (const line of stateRef.current.terminal) term.writeln(formatLine(line.kind, line.text, stateRef.current))
    printedRef.current = stateRef.current.terminal.length
    renderLine()

    // Input typed while a command runs is queued, never dropped (fast typists, pasted sequences).
    let running = false
    const queue: string[] = []
    const process = async (data: string) => {
      const ed = editorRef.current
      const actions = ed.handle(data)
      for (const a of actions) {
        if (a.type === 'submit') {
          term.write('\r\n')
          running = true
          try {
            await onRunRef.current(a.line)
          } finally {
            running = false
          }
          ed.setHistory(sessionRef.current.shell.history.map((h) => h.input))
          continue
        }
        if (a.type === 'interrupt') {
          term.write('^C\r\n')
          renderLine()
          continue
        }
        if (a.type === 'clear') {
          term.clear()
          renderLine()
          continue
        }
        if (a.type === 'eof') continue
        if (a.type === 'complete') {
          const s = sessionRef.current
          const candidates = await complete(s.fs, s.shell.cwd, '/home/learner', a.prefix, a.word, stateRef.current.repo.branches)
          if (candidates.length === 1) {
            const c = candidates[0]!
            ed.applyCompletion(a.prefix, c.endsWith('/') ? c : c + ' ')
          } else if (candidates.length > 1) {
            const prefix = commonPrefix(candidates)
            if (prefix.length > a.word.length) ed.applyCompletion(a.prefix, prefix)
            else term.write('\r\n' + candidates.join('  ') + '\r\n')
          }
        }
      }
      renderLine()
    }
    let draining = false
    const drain = async () => {
      if (draining) return
      draining = true
      try {
        while (queue.length) await process(queue.shift()!)
      } finally {
        draining = false
      }
    }
    const disposable = term.onData((data) => {
      if (data === '\x03' && running) return // cannot interrupt the engine mid-command; input after it is queued
      queue.push(data)
      void drain()
    })
    return () => {
      disposable.dispose()
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Print new transcript lines as they arrive; handle clears and prompt changes.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const lines = state.terminal
    if (lines.length < printedRef.current) {
      term.clear()
      term.write('\x1b[2J\x1b[H')
      printedRef.current = 0
    }
    if (printedRef.current === 0 && lines.length) {
      // full repaint after clear/undo: the current input line was already submitted
      term.write('\r\x1b[K')
    }
    const fresh = lines.slice(printedRef.current)
    for (const line of fresh) {
      if (line.kind === 'input') continue // the learner's typed line is already on screen
      term.writeln(formatLine(line.kind, line.text, state))
    }
    printedRef.current = lines.length
    if (!state.busy) renderLine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.terminal, state.busy, state.prompt, state.displayPath, state.repo])

  useEffect(() => {
    if (focusSignal) termRef.current?.focus()
  }, [focusSignal])

  return (
    <div className="flex h-full flex-col bg-terminal-bg">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#3c4043] px-3 text-xs text-[#9aa0a6]">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="terminal" size={16} /> Terminal
        </span>
        <span className="font-mono">{state.prompt ? 'waiting for your answer' : state.busy ? 'running…' : 'learner@commitlab'}</span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1" role="application" aria-label="Terminal. Type shell and git commands." />
    </div>
  )
}

function formatLine(kind: 'input' | 'output' | 'system', text: string, state: SessionState): string {
  if (kind === 'system') return `\x1b[90m${text}\x1b[0m`
  if (kind === 'input') return `${promptText(state.displayPath, promptBranch(state.repo))}${text}`
  return text
}

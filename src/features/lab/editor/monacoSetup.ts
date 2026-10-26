import * as monaco from './monacoCore'
import { loader } from '@monaco-editor/react'

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker }
  }
}

let configured = false

/** Bundle Monaco locally (no CDN) and register the Commit Lab theme and Git languages. */
export function setupMonaco(): void {
  if (configured) return
  configured = true
  self.MonacoEnvironment = {
    getWorker(_: string, label: string) {
      // `new URL(..., import.meta.url)` works identically in Vite dev (no pre-bundling) and in the build.
      if (label === 'json') return new Worker(new URL('monaco-esm/language/json/json.worker.js', import.meta.url), { type: 'module' })
      return new Worker(new URL('monaco-esm/editor/editor.worker.js', import.meta.url), { type: 'module' })
    },
  }
  loader.config({ monaco: monaco as unknown as Parameters<typeof loader.config>[0]['monaco'] })

  monaco.editor.defineTheme('commitlab-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5f6368', fontStyle: 'italic' },
      { token: 'keyword', foreground: '1967d2' },
      { token: 'string', foreground: '188038' },
      { token: 'number', foreground: 'c5221f' },
      { token: 'type', foreground: '9334e6' },
      { token: 'conflict.marker', foreground: 'c5221f', fontStyle: 'bold' },
      { token: 'rebase.action', foreground: '1967d2', fontStyle: 'bold' },
      { token: 'rebase.hash', foreground: 'e37400' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#202124',
      'editor.lineHighlightBackground': '#f8f9fa',
      'editorLineNumber.foreground': '#9aa0a6',
      'editorLineNumber.activeForeground': '#5f6368',
      'editor.selectionBackground': '#d2e3fc',
      'editorIndentGuide.background1': '#e8eaed',
      'editorGutter.background': '#ffffff',
      'editorWidget.background': '#ffffff',
      'editorCursor.foreground': '#1a73e8',
      focusBorder: '#1a73e8',
    },
  })

  monaco.languages.register({ id: 'git-rebase' })
  monaco.languages.setMonarchTokensProvider('git-rebase', {
    tokenizer: {
      root: [
        [/^#.*$/, 'comment'],
        [/^(pick|reword|edit|squash|fixup|drop|p|r|e|s|f|d)\b/, 'rebase.action'],
        [/\b[0-9a-f]{7,40}\b/, 'rebase.hash'],
      ],
    },
  })
  monaco.languages.register({ id: 'git-commit' })
  monaco.languages.setMonarchTokensProvider('git-commit', {
    tokenizer: { root: [[/^#.*$/, 'comment']] },
  })
}

export function languageFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'sh':
      return 'shell'
    default:
      return 'plaintext'
  }
}

export { monaco }

/**
 * Pure line-editing state machine for the xterm-based terminal.
 * Converts raw key data into buffer changes and high-level actions so it can be unit-tested.
 */
export type EditorAction =
  { type: 'submit'; line: string } | { type: 'interrupt' } | { type: 'clear' } | { type: 'complete'; prefix: string; word: string } | { type: 'eof' }

export class LineEditor {
  buffer = ''
  cursor = 0
  private history: string[] = []
  private historyIndex = -1
  private draft = ''

  constructor(history: string[] = []) {
    this.history = history
  }

  setHistory(history: string[]) {
    this.history = history
    this.historyIndex = -1
  }

  reset() {
    this.buffer = ''
    this.cursor = 0
    this.historyIndex = -1
    this.draft = ''
  }

  setBuffer(text: string) {
    this.buffer = text
    this.cursor = text.length
  }

  /** Feed raw terminal input. Returns actions; the caller re-renders after each call. */
  handle(data: string): EditorAction[] {
    const actions: EditorAction[] = []
    // Bracketed paste or multi-char paste: insert text, submitting on newlines.
    if (data.length > 1 && !data.startsWith('\x1b')) {
      const lines = data.replace(/\r\n?/g, '\n').split('\n')
      lines.forEach((line, i) => {
        this.insert(line)
        if (i < lines.length - 1) {
          actions.push({ type: 'submit', line: this.buffer })
          this.pushHistory(this.buffer)
          this.reset()
        }
      })
      return actions
    }
    switch (data) {
      case '\r':
      case '\n': {
        const line = this.buffer
        this.pushHistory(line)
        this.reset()
        actions.push({ type: 'submit', line })
        break
      }
      case '\x7f': // Backspace
      case '\b':
        if (this.cursor > 0) {
          this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor)
          this.cursor--
        }
        break
      case '\x1b[3~': // Delete
        if (this.cursor < this.buffer.length) this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1)
        break
      case '\x03': // Ctrl+C
        this.reset()
        actions.push({ type: 'interrupt' })
        break
      case '\x04': // Ctrl+D
        actions.push({ type: 'eof' })
        break
      case '\x0c': // Ctrl+L
        actions.push({ type: 'clear' })
        break
      case '\x15': // Ctrl+U
        this.buffer = this.buffer.slice(this.cursor)
        this.cursor = 0
        break
      case '\x0b': // Ctrl+K
        this.buffer = this.buffer.slice(0, this.cursor)
        break
      case '\x17': {
        // Ctrl+W: delete word before cursor
        const before = this.buffer.slice(0, this.cursor).replace(/\S*\s*$/, '')
        this.buffer = before + this.buffer.slice(this.cursor)
        this.cursor = before.length
        break
      }
      case '\x01': // Ctrl+A
      case '\x1b[H':
      case '\x1b[1~':
        this.cursor = 0
        break
      case '\x05': // Ctrl+E
      case '\x1b[F':
      case '\x1b[4~':
        this.cursor = this.buffer.length
        break
      case '\x1b[D': // Left
        if (this.cursor > 0) this.cursor--
        break
      case '\x1b[C': // Right
        if (this.cursor < this.buffer.length) this.cursor++
        break
      case '\x1b[1;5D':
      case '\x1bb': {
        // word left
        const m = /\S+\s*$/.exec(this.buffer.slice(0, this.cursor))
        this.cursor = m ? this.cursor - m[0].length : 0
        break
      }
      case '\x1b[1;5C':
      case '\x1bf': {
        const m = /^\s*\S+/.exec(this.buffer.slice(this.cursor))
        this.cursor = m ? this.cursor + m[0].length : this.buffer.length
        break
      }
      case '\x1b[A': // Up
        this.historyMove(-1)
        break
      case '\x1b[B': // Down
        this.historyMove(1)
        break
      case '\t': {
        const before = this.buffer.slice(0, this.cursor)
        const m = /(\S*)$/.exec(before)
        actions.push({ type: 'complete', prefix: before.slice(0, before.length - (m?.[1]?.length ?? 0)), word: m?.[1] ?? '' })
        break
      }
      default:
        if (data >= ' ' || data === '\t') this.insert(data)
    }
    return actions
  }

  /** Apply a completion by replacing the current word. */
  applyCompletion(prefix: string, word: string) {
    const after = this.buffer.slice(this.cursor)
    this.buffer = prefix + word + after
    this.cursor = (prefix + word).length
  }

  private insert(text: string) {
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor)
    this.cursor += text.length
  }

  private pushHistory(line: string) {
    if (line.trim() && this.history[this.history.length - 1] !== line) this.history.push(line)
    this.historyIndex = -1
  }

  private historyMove(dir: -1 | 1) {
    if (!this.history.length) return
    if (this.historyIndex === -1) {
      if (dir === 1) return
      this.draft = this.buffer
      this.historyIndex = this.history.length - 1
    } else {
      this.historyIndex += dir
      if (this.historyIndex >= this.history.length) {
        this.historyIndex = -1
        this.setBuffer(this.draft)
        return
      }
      if (this.historyIndex < 0) this.historyIndex = 0
    }
    this.setBuffer(this.history[this.historyIndex] ?? '')
  }
}

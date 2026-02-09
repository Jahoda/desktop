import * as React from 'react'
import { clipboard, ipcRenderer } from 'electron'
import '@xterm/xterm/css/xterm.css'

interface ITerminalViewProps {
  readonly terminalId: string
  readonly isActive: boolean
}

export class TerminalView extends React.Component<ITerminalViewProps> {
  private containerRef = React.createRef<HTMLDivElement>()
  private terminal: any = null
  private fitAddon: any = null
  private resizeObserver: ResizeObserver | null = null
  /** Buffer PTY output that arrives before xterm is ready */
  private pendingOutput: string[] = []
  private xtermReady = false

  public componentDidMount() {
    // Register IPC listeners FIRST to not miss any output
    ipcRenderer.on('pty-output', this.onPtyOutput)
    ipcRenderer.on('pty-exit', this.onPtyExit)
    this.initTerminal()
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('pty-output', this.onPtyOutput)
    ipcRenderer.removeListener('pty-exit', this.onPtyExit)
    this.resizeObserver?.disconnect()
    this.terminal?.dispose()
  }

  public componentDidUpdate(prevProps: ITerminalViewProps) {
    if (this.props.isActive) {
      // Use rAF to ensure the element is visible after display change,
      // then a short delay to let the layout settle before fitting
      requestAnimationFrame(() => {
        setTimeout(() => {
          this.fit()
          if (!prevProps.isActive) {
            this.focusTerminal()
          }
        }, 20)
      })
    }
  }

  private onPtyOutput = (_: any, id: string, data: string) => {
    if (id !== this.props.terminalId) {
      return
    }

    if (this.xtermReady && this.terminal) {
      this.terminal.write(data)
    } else {
      // Buffer output until xterm is ready
      this.pendingOutput.push(data)
    }
  }

  private onPtyExit = (_: any, id: string) => {
    if (id !== this.props.terminalId) {
      return
    }

    if (this.terminal) {
      this.terminal.write('\r\n[Process exited]\r\n')
    }
  }

  private focusTerminal() {
    if (!this.terminal) {
      return
    }
    this.terminal.focus()
    // Also focus the underlying textarea directly
    const container = this.containerRef.current
    if (container) {
      const textarea = container.querySelector(
        '.xterm-helper-textarea'
      ) as HTMLTextAreaElement | null
      if (textarea) {
        textarea.focus()
      }
    }
  }

  private async initTerminal() {
    const container = this.containerRef.current
    if (!container) {
      return
    }

    try {
      const { Terminal } = await import('@xterm/xterm')

      this.terminal = new Terminal({
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          selectionBackground: '#264f78',
        },
        cursorBlink: true,
        allowProposedApi: true,
        macOptionIsMeta: true,
      })

      try {
        const { FitAddon } = await import('@xterm/addon-fit')
        this.fitAddon = new FitAddon()
        this.terminal.loadAddon(this.fitAddon)
      } catch {
        // FitAddon not available
      }

      this.terminal.open(container)

      // Flush any buffered output
      this.xtermReady = true
      for (const data of this.pendingOutput) {
        this.terminal.write(data)
      }
      this.pendingOutput = []

      // Custom key handling for better usability
      this.terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type !== 'keydown') {
          return true
        }

        const isMeta = e.metaKey

        // Cmd+C: copy selection (if any), otherwise send SIGINT
        if (isMeta && e.key === 'c') {
          const sel = this.terminal.getSelection()
          if (sel) {
            clipboard.writeText(sel)
            return false
          }
          return true
        }

        // Cmd+V: paste from clipboard
        if (isMeta && e.key === 'v') {
          const text = clipboard.readText()
          if (text) {
            ipcRenderer.invoke('pty-write', this.props.terminalId, text)
          }
          return false
        }

        // Cmd+A: select all terminal content
        if (isMeta && e.key === 'a') {
          this.terminal.selectAll()
          return false
        }

        // Shift+Arrow keys: extend selection
        if (e.shiftKey && !isMeta && !e.ctrlKey && !e.altKey) {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
              e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            this.handleShiftArrowSelection(e.key)
            return false
          }
        }

        // Shift+Option+Arrow: extend selection by word
        if (e.shiftKey && e.altKey && !isMeta && !e.ctrlKey) {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            this.handleShiftOptionArrowSelection(e.key)
            return false
          }
        }

        return true
      })

      // Handle user input - send to PTY
      this.terminal.onData((data: string) => {
        this.selectionAnchor = null
        ipcRenderer.invoke('pty-write', this.props.terminalId, data)
      })

      // Setup resize observer
      this.resizeObserver = new ResizeObserver(() => {
        this.fit()
      })
      this.resizeObserver.observe(container)

      this.fit()
      setTimeout(() => this.focusTerminal(), 100)
    } catch (err) {
      console.error('[terminal-view] Failed to init xterm:', err)
      container.textContent =
        'Terminal failed to initialize: ' + String(err)
    }
  }

  private selectionAnchor: { x: number; y: number } | null = null

  private handleShiftArrowSelection(key: string) {
    if (!this.terminal) {
      return
    }

    const sel = this.terminal.getSelectionPosition()
    const buf = this.terminal.buffer.active

    if (!sel) {
      // Start new selection from cursor position
      const cx = buf.cursorX
      const cy = buf.cursorY + buf.baseY
      this.selectionAnchor = { x: cx, y: cy }

      let nx = cx
      let ny = cy

      if (key === 'ArrowLeft') {
        nx = cx > 0 ? cx - 1 : cx
      } else if (key === 'ArrowRight') {
        nx = cx + 1
      } else if (key === 'ArrowUp') {
        ny = cy > 0 ? cy - 1 : cy
      } else if (key === 'ArrowDown') {
        ny = cy + 1
      }

      const startX = Math.min(this.selectionAnchor.x, nx)
      const startY = Math.min(this.selectionAnchor.y, ny)
      const endX = Math.max(this.selectionAnchor.x, nx)
      const endY = Math.max(this.selectionAnchor.y, ny)
      this.terminal.select(
        startX,
        startY,
        startY === endY ? endX - startX : (this.terminal.cols - startX) + endX + (endY - startY - 1) * this.terminal.cols
      )
      return
    }

    // Extend existing selection
    if (!this.selectionAnchor) {
      this.selectionAnchor = { x: sel.start.x, y: sel.start.y }
    }

    // Figure out which end to move (the one farther from anchor)
    let endX = sel.end.x
    let endY = sel.end.y

    if (key === 'ArrowLeft') {
      endX = endX > 0 ? endX - 1 : endX
    } else if (key === 'ArrowRight') {
      endX = endX + 1
    } else if (key === 'ArrowUp') {
      endY = endY > 0 ? endY - 1 : endY
    } else if (key === 'ArrowDown') {
      endY = endY + 1
    }

    const ax = this.selectionAnchor.x
    const ay = this.selectionAnchor.y
    const sX = ay < endY || (ay === endY && ax <= endX) ? ax : endX
    const sY = ay < endY || (ay === endY && ax <= endX) ? ay : endY
    const eX = ay < endY || (ay === endY && ax <= endX) ? endX : ax
    const eY = ay < endY || (ay === endY && ax <= endX) ? endY : ay
    const len = sY === eY ? eX - sX : (this.terminal.cols - sX) + eX + (eY - sY - 1) * this.terminal.cols
    this.terminal.select(sX, sY, Math.max(len, 1))
  }

  private handleShiftOptionArrowSelection(key: string) {
    if (!this.terminal) {
      return
    }

    const buf = this.terminal.buffer.active
    const sel = this.terminal.getSelectionPosition()

    // Determine the current "cursor" for selection
    let cx: number
    let cy: number
    if (sel) {
      cx = sel.end.x
      cy = sel.end.y
      if (!this.selectionAnchor) {
        this.selectionAnchor = { x: sel.start.x, y: sel.start.y }
      }
    } else {
      cx = buf.cursorX
      cy = buf.cursorY + buf.baseY
      this.selectionAnchor = { x: cx, y: cy }
    }

    // Find word boundary
    const line = buf.getLine(cy)
    if (!line) {
      return
    }

    let nx = cx
    if (key === 'ArrowLeft') {
      // Skip spaces, then skip word chars
      while (nx > 0 && (line.getCell(nx - 1)?.getChars() ?? ' ').trim() === '') { nx-- }
      while (nx > 0 && (line.getCell(nx - 1)?.getChars() ?? ' ').trim() !== '') { nx-- }
    } else {
      const cols = this.terminal.cols
      while (nx < cols && (line.getCell(nx)?.getChars() ?? ' ').trim() !== '') { nx++ }
      while (nx < cols && (line.getCell(nx)?.getChars() ?? ' ').trim() === '') { nx++ }
    }

    const ax = this.selectionAnchor.x
    const ay = this.selectionAnchor.y
    const sX = ay < cy || (ay === cy && ax <= nx) ? ax : nx
    const sY = ay < cy || (ay === cy && ax <= nx) ? ay : cy
    const eX = ay < cy || (ay === cy && ax <= nx) ? nx : ax
    const eY = ay < cy || (ay === cy && ax <= nx) ? cy : ay
    const len = sY === eY ? eX - sX : (this.terminal.cols - sX) + eX + (eY - sY - 1) * this.terminal.cols
    this.terminal.select(sX, sY, Math.max(len, 1))
  }

  private fit() {
    if (this.fitAddon) {
      try {
        this.fitAddon.fit()
        const dims = this.fitAddon.proposeDimensions()
        if (dims) {
          ipcRenderer.invoke(
            'pty-resize',
            this.props.terminalId,
            dims.cols,
            dims.rows
          )
        }
      } catch {
        // ignore fit errors
      }
    }
  }

  private onClick = () => {
    this.focusTerminal()
  }

  private onKeyDown = (e: React.KeyboardEvent) => {
    // Allow Cmd/Ctrl+` to toggle terminal
    const modifier = e.metaKey || e.ctrlKey
    if (modifier && e.key === '`') {
      return
    }
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
  }

  public render() {
    return (
      <div
        className="terminal-view"
        ref={this.containerRef}
        style={{ display: this.props.isActive ? 'block' : 'none' }}
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
        tabIndex={-1}
      />
    )
  }
}

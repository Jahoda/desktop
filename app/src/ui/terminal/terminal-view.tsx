import * as React from 'react'
import { clipboard, ipcRenderer, shell } from 'electron'
import '@xterm/xterm/css/xterm.css'

interface ITerminalViewProps {
  readonly terminalId: string
  readonly isActive: boolean
}

export class TerminalView extends React.Component<ITerminalViewProps> {
  private containerRef = React.createRef<HTMLDivElement>()
  private terminal: any = null
  private fitAddon: any = null
  private webglAddon: any = null
  private resizeObserver: ResizeObserver | null = null
  /** Buffer PTY output that arrives before xterm is ready */
  private pendingOutput: string[] = []
  private xtermReady = false
  private disposed = false
  private fitTimeout: ReturnType<typeof setTimeout> | null = null

  public componentDidMount() {
    // Register IPC listeners FIRST to not miss any output
    ipcRenderer.on('pty-output', this.onPtyOutput)
    ipcRenderer.on('pty-exit', this.onPtyExit)
    this.initTerminal()
  }

  public componentWillUnmount() {
    this.disposed = true
    if (this.fitTimeout) {
      clearTimeout(this.fitTimeout)
    }
    ipcRenderer.removeListener('pty-output', this.onPtyOutput)
    ipcRenderer.removeListener('pty-exit', this.onPtyExit)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.webglAddon?.dispose()
    this.terminal?.dispose()
  }

  public componentDidUpdate(prevProps: ITerminalViewProps) {
    if (this.props.isActive) {
      requestAnimationFrame(() => {
        if (this.disposed) {
          return
        }
        setTimeout(() => {
          if (this.disposed) {
            return
          }
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

      if (this.disposed) {
        return
      }

      this.terminal = new Terminal({
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          cursorAccent: '#1e1e1e',
          selectionBackground: '#264f78',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#ffffff',
        },
        cursorBlink: true,
        cursorStyle: 'bar',
        allowProposedApi: true,
        macOptionIsMeta: true,
        scrollback: 5000,
        tabStopWidth: 4,
        drawBoldTextInBrightColors: true,
        fastScrollModifier: 'alt',
        smoothScrollDuration: 100,
      })

      // Load addons - all with graceful fallbacks
      await this.loadAddons()

      this.terminal.open(container)

      // WebGL must be activated after open()
      await this.activateWebGL()

      // Flush buffered output
      this.xtermReady = true
      for (const data of this.pendingOutput) {
        this.terminal.write(data)
      }
      this.pendingOutput = []

      this.setupKeyHandlers()
      this.setupInputHandler()
      this.setupResizeObserver(container)

      this.fit()
      setTimeout(() => {
        if (!this.disposed) {
          this.focusTerminal()
        }
      }, 100)
    } catch (err) {
      console.error('[terminal-view] Failed to init xterm:', err)
      container.textContent =
        'Terminal failed to initialize: ' + String(err)
    }
  }

  private async loadAddons() {
    // FitAddon - responsive terminal sizing
    try {
      const { FitAddon } = await import('@xterm/addon-fit')
      this.fitAddon = new FitAddon()
      this.terminal.loadAddon(this.fitAddon)
    } catch {
      // FitAddon not available
    }

    // WebLinksAddon - clickable URLs
    try {
      const { WebLinksAddon } = await import('@xterm/addon-web-links')
      this.terminal.loadAddon(
        new WebLinksAddon((_event: MouseEvent, uri: string) => {
          shell.openExternal(uri)
        })
      )
    } catch {
      // WebLinksAddon not available
    }

    // Unicode11Addon - better emoji/unicode support
    try {
      const { Unicode11Addon } = await import('@xterm/addon-unicode11')
      const unicode11 = new Unicode11Addon()
      this.terminal.loadAddon(unicode11)
      this.terminal.unicode.activeVersion = '11'
    } catch {
      // Unicode11Addon not available
    }
  }

  private async activateWebGL() {
    try {
      const { WebglAddon } = await import('@xterm/addon-webgl')
      if (this.disposed) {
        return
      }
      this.webglAddon = new WebglAddon()
      // Fall back to canvas renderer if WebGL context is lost
      this.webglAddon.onContextLoss(() => {
        console.warn('[terminal-view] WebGL context lost, falling back to canvas')
        this.webglAddon?.dispose()
        this.webglAddon = null
      })
      this.terminal.loadAddon(this.webglAddon)
    } catch {
      // WebGL not available, xterm falls back to canvas automatically
    }
  }

  private setupKeyHandlers() {
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

      // Cmd+K: clear terminal
      if (isMeta && e.key === 'k') {
        this.terminal.clear()
        return false
      }

      // Shift+Arrow keys: extend selection
      if (e.shiftKey && !isMeta && !e.ctrlKey && !e.altKey) {
        if (
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown'
        ) {
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
  }

  private setupInputHandler() {
    this.terminal.onData((data: string) => {
      this.selectionAnchor = null
      ipcRenderer.invoke('pty-write', this.props.terminalId, data)
    })
  }

  private setupResizeObserver(container: HTMLElement) {
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.disposed) {
        this.debouncedFit()
      }
    })
    this.resizeObserver.observe(container)
  }

  private selectionAnchor: { x: number; y: number } | null = null

  private handleShiftArrowSelection(key: string) {
    if (!this.terminal) {
      return
    }

    const sel = this.terminal.getSelectionPosition()
    const buf = this.terminal.buffer.active

    if (!sel) {
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
        startY === endY
          ? endX - startX
          : this.terminal.cols - startX + endX + (endY - startY - 1) * this.terminal.cols
      )
      return
    }

    if (!this.selectionAnchor) {
      this.selectionAnchor = { x: sel.start.x, y: sel.start.y }
    }

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
    const len =
      sY === eY
        ? eX - sX
        : this.terminal.cols - sX + eX + (eY - sY - 1) * this.terminal.cols
    this.terminal.select(sX, sY, Math.max(len, 1))
  }

  private handleShiftOptionArrowSelection(key: string) {
    if (!this.terminal) {
      return
    }

    const buf = this.terminal.buffer.active
    const sel = this.terminal.getSelectionPosition()

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

    const line = buf.getLine(cy)
    if (!line) {
      return
    }

    let nx = cx
    if (key === 'ArrowLeft') {
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
    const len =
      sY === eY
        ? eX - sX
        : this.terminal.cols - sX + eX + (eY - sY - 1) * this.terminal.cols
    this.terminal.select(sX, sY, Math.max(len, 1))
  }

  /** Debounced fit to avoid excessive resize calls */
  private debouncedFit() {
    if (this.fitTimeout) {
      clearTimeout(this.fitTimeout)
    }
    this.fitTimeout = setTimeout(() => {
      this.fitTimeout = null
      this.fit()
    }, 50)
  }

  private fit() {
    if (this.disposed || !this.fitAddon || !this.terminal) {
      return
    }
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

  private onClick = () => {
    this.focusTerminal()
  }

  private onKeyDown = (e: React.KeyboardEvent) => {
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

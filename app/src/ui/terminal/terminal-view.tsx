import * as React from 'react'
import * as ipcRenderer from '../../lib/ipc-renderer'

interface ITerminalViewProps {
  readonly terminalId: string
  readonly isActive: boolean
}

export class TerminalView extends React.Component<ITerminalViewProps> {
  private containerRef = React.createRef<HTMLDivElement>()
  private terminal: any = null
  private fitAddon: any = null
  private resizeObserver: ResizeObserver | null = null

  public componentDidMount() {
    this.initTerminal()
    ipcRenderer.on('pty-output', this.onPtyOutput)
    ipcRenderer.on('pty-exit', this.onPtyExit)
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('pty-output', this.onPtyOutput)
    ipcRenderer.removeListener('pty-exit', this.onPtyExit)
    this.resizeObserver?.disconnect()
    this.terminal?.dispose()
  }

  public componentDidUpdate(prevProps: ITerminalViewProps) {
    if (!prevProps.isActive && this.props.isActive) {
      this.fit()
      this.terminal?.focus()
    }
  }

  private onPtyOutput = (_: any, id: string, data: string) => {
    if (id === this.props.terminalId && this.terminal) {
      this.terminal.write(data)
    }
  }

  private onPtyExit = (_: any, id: string) => {
    if (id === this.props.terminalId && this.terminal) {
      this.terminal.write('\r\n[Process exited]\r\n')
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
      })

      try {
        const { FitAddon } = await import('@xterm/addon-fit')
        this.fitAddon = new FitAddon()
        this.terminal.loadAddon(this.fitAddon)
      } catch {
        // FitAddon not available
      }

      this.terminal.open(container)

      // Handle user input
      this.terminal.onData((data: string) => {
        ipcRenderer.invoke(
          'pty-write',
          this.props.terminalId,
          data
        )
      })

      // Setup resize observer
      this.resizeObserver = new ResizeObserver(() => {
        this.fit()
      })
      this.resizeObserver.observe(container)

      this.fit()
      this.terminal.focus()
    } catch (err) {
      // xterm.js not available, show fallback
      container.textContent =
        'Terminal requires @xterm/xterm package. Install it with: yarn add @xterm/xterm @xterm/addon-fit'
    }
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

  public render() {
    return (
      <div
        className="terminal-view"
        ref={this.containerRef}
        style={{ display: this.props.isActive ? 'block' : 'none' }}
      />
    )
  }
}

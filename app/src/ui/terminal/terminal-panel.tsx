import * as React from 'react'
import { TerminalView } from './terminal-view'
import { TerminalTabs, ITerminalTab } from './terminal-tabs'
import * as ipcRenderer from '../../lib/ipc-renderer'

interface ITerminalPanelProps {
  readonly cwd: string
}

interface ITerminalPanelState {
  readonly tabs: ReadonlyArray<ITerminalTab>
  readonly activeTabId: string | null
  readonly height: number
}

const MIN_HEIGHT = 100
const DEFAULT_HEIGHT = 250
const MAX_HEIGHT = 600

export class TerminalPanel extends React.Component<
  ITerminalPanelProps,
  ITerminalPanelState
> {
  private isDragging = false
  private startY = 0
  private startHeight = 0

  public constructor(props: ITerminalPanelProps) {
    super(props)
    this.state = {
      tabs: [],
      activeTabId: null,
      height: DEFAULT_HEIGHT,
    }
  }

  public componentDidMount() {
    this.createNewTerminal()
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mouseup', this.onMouseUp)
  }

  public componentWillUnmount() {
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mouseup', this.onMouseUp)

    // Clean up all terminals
    for (const tab of this.state.tabs) {
      ipcRenderer.invoke('pty-destroy', tab.id)
    }
  }

  private createNewTerminal = async () => {
    const id = await ipcRenderer.invoke('pty-create', this.props.cwd)
    const tabNumber = this.state.tabs.length + 1
    const newTab: ITerminalTab = {
      id,
      title: `Terminal ${tabNumber}`,
    }

    this.setState({
      tabs: [...this.state.tabs, newTab],
      activeTabId: id,
    })
  }

  private onTabClicked = (id: string) => {
    this.setState({ activeTabId: id })
  }

  private onTabClosed = async (id: string) => {
    await ipcRenderer.invoke('pty-destroy', id)

    const tabs = this.state.tabs.filter(t => t.id !== id)
    let activeTabId = this.state.activeTabId

    if (activeTabId === id) {
      activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null
    }

    if (tabs.length === 0) {
      // Create a new terminal if the last one was closed
      this.setState({ tabs, activeTabId: null }, () => {
        this.createNewTerminal()
      })
    } else {
      this.setState({ tabs, activeTabId })
    }
  }

  private onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    this.isDragging = true
    this.startY = e.clientY
    this.startHeight = this.state.height
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) {
      return
    }

    const delta = this.startY - e.clientY
    const newHeight = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, this.startHeight + delta)
    )
    this.setState({ height: newHeight })
  }

  private onMouseUp = () => {
    this.isDragging = false
  }

  public render() {
    const { tabs, activeTabId, height } = this.state

    return (
      <div className="terminal-panel" style={{ height }}>
        <div className="terminal-resize-handle" onMouseDown={this.onResizeStart} />
        <div className="terminal-panel-header">
          <TerminalTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClicked={this.onTabClicked}
            onTabClosed={this.onTabClosed}
            onNewTab={this.createNewTerminal}
          />
        </div>
        <div className="terminal-content">
          {tabs.map(tab => (
            <TerminalView
              key={tab.id}
              terminalId={tab.id}
              isActive={tab.id === activeTabId}
            />
          ))}
        </div>
      </div>
    )
  }
}

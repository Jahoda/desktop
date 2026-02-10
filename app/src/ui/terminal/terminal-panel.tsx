import * as React from 'react'
import { TerminalView } from './terminal-view'
import { TerminalTabs, ITerminalTab } from './terminal-tabs'
import { ipcRenderer } from 'electron'

interface ITerminalPanelProps {
  readonly cwd: string
  readonly repoId: number
}

/** Per-repo terminal state */
interface IRepoTerminals {
  tabs: ITerminalTab[]
  activeTabId: string | null
  height: number
  collapsed: boolean
}

interface ITerminalPanelState {
  /** Dummy counter to trigger re-renders when per-repo state changes */
  readonly tick: number
}

const MIN_HEIGHT = 100
const DEFAULT_HEIGHT = 250
const MAX_HEIGHT = 600

/**
 * Terminal panel that preserves terminal instances across repo switches.
 * Each repo has its own set of terminal tabs stored in a static Map.
 */
export class TerminalPanel extends React.Component<
  ITerminalPanelProps,
  ITerminalPanelState
> {
  /**
   * Static map: repoId -> terminal state.
   * Survives component re-renders and repo switches.
   */
  private static repoTerminals = new Map<number, IRepoTerminals>()

  private isDragging = false
  private startY = 0
  private startHeight = 0

  public constructor(props: ITerminalPanelProps) {
    super(props)
    this.state = { tick: 0 }
  }

  public componentDidMount() {
    this.ensureTerminalForRepo()
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mouseup', this.onMouseUp)
  }

  public componentWillUnmount() {
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mouseup', this.onMouseUp)
  }

  public componentDidUpdate(prevProps: ITerminalPanelProps) {
    if (prevProps.repoId !== this.props.repoId) {
      this.ensureTerminalForRepo()
    }
  }

  private getRepoState(): IRepoTerminals {
    return TerminalPanel.repoTerminals.get(this.props.repoId) || {
      tabs: [],
      activeTabId: null,
      height: DEFAULT_HEIGHT,
      collapsed: false,
    }
  }

  private setRepoState(state: IRepoTerminals) {
    TerminalPanel.repoTerminals.set(this.props.repoId, state)
    this.setState(prev => ({ tick: prev.tick + 1 }))
  }

  private ensureTerminalForRepo() {
    const state = this.getRepoState()
    if (state.tabs.length === 0) {
      this.createNewTerminal()
    } else {
      this.forceUpdate()
    }
  }

  private createNewTerminal = async () => {
    const id: string = await ipcRenderer.invoke('pty-create', this.props.cwd)
    const state = this.getRepoState()
    const tabNumber = state.tabs.length + 1
    const newTab: ITerminalTab = {
      id,
      title: `Terminal ${tabNumber}`,
    }

    this.setRepoState({
      ...state,
      tabs: [...state.tabs, newTab],
      activeTabId: id,
    })
  }

  private onTabClicked = (id: string) => {
    const state = this.getRepoState()
    this.setRepoState({ ...state, activeTabId: id })
  }

  private onTabClosed = async (id: string) => {
    await ipcRenderer.invoke('pty-destroy', id)

    const state = this.getRepoState()
    const tabs = state.tabs.filter(t => t.id !== id)
    let activeTabId = state.activeTabId

    if (activeTabId === id) {
      activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null
    }

    if (tabs.length === 0) {
      this.setRepoState({ ...state, tabs: [], activeTabId: null })
      this.createNewTerminal()
    } else {
      this.setRepoState({ ...state, tabs, activeTabId })
    }
  }

  private onToggleCollapse = () => {
    const state = this.getRepoState()
    this.setRepoState({ ...state, collapsed: !state.collapsed })
  }

  private onResizeStart = (e: React.MouseEvent) => {
    const state = this.getRepoState()
    if (state.collapsed) {
      return
    }
    e.preventDefault()
    this.isDragging = true
    this.startY = e.clientY
    this.startHeight = state.height
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
    const state = this.getRepoState()
    this.setRepoState({ ...state, height: newHeight })
  }

  private onMouseUp = () => {
    this.isDragging = false
  }

  public render() {
    const repoState = this.getRepoState()
    const { tabs, activeTabId, height, collapsed } = repoState

    // Collect all terminal tabs across all repos so we can render
    // them all (hidden) to keep PTY connections alive
    const allTerminals: Array<{
      tab: ITerminalTab
      repoId: number
      isCurrentRepo: boolean
    }> = []

    TerminalPanel.repoTerminals.forEach((state, repoId) => {
      for (const tab of state.tabs) {
        allTerminals.push({
          tab,
          repoId,
          isCurrentRepo: repoId === this.props.repoId,
        })
      }
    })

    const panelClass = collapsed ? 'terminal-panel collapsed' : 'terminal-panel'

    return (
      <div className={panelClass} style={collapsed ? undefined : { height }}>
        {!collapsed && (
          <div
            className="terminal-resize-handle"
            onMouseDown={this.onResizeStart}
          />
        )}
        <div className="terminal-panel-header">
          <TerminalTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClicked={this.onTabClicked}
            onTabClosed={this.onTabClosed}
            onNewTab={this.createNewTerminal}
          />
          <button
            className="terminal-collapse-btn"
            onClick={this.onToggleCollapse}
            title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
          >
            {collapsed ? '\u25B2' : '\u25BC'}
          </button>
        </div>
        <div
          className="terminal-content"
          style={collapsed ? { display: 'none' } : undefined}
        >
          {allTerminals.map(({ tab, isCurrentRepo }) => (
            <TerminalView
              key={tab.id}
              terminalId={tab.id}
              isActive={!collapsed && isCurrentRepo && tab.id === activeTabId}
            />
          ))}
        </div>
      </div>
    )
  }
}

import * as React from 'react'
import { ScriptItem } from './script-item'
import { ScriptOutput } from './script-output'
import {
  PackageManager,
  IWorkspacePackage,
} from '../../lib/npm/script-detector'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { getStringArray, setStringArray } from '../../lib/local-storage'

interface INpmScriptsPanelProps {
  readonly repoPath: string
  readonly rootScripts: Record<string, string>
  readonly workspaces: ReadonlyArray<IWorkspacePackage>
  readonly manager: PackageManager
}

interface IRunningScriptState {
  readonly id: string
  readonly scriptName: string
  readonly packagePath: string
  readonly output: string
  readonly exitCode: number | null
  readonly isRunning: boolean
}

interface INpmScriptsPanelState {
  readonly runningScripts: Map<string, IRunningScriptState>
  readonly expandedScript: string | null
  readonly collapsedSections: Set<string>
  readonly pinnedScripts: Set<string>
  readonly height: number
}

const MIN_HEIGHT = 80
const DEFAULT_HEIGHT = 200
const MAX_HEIGHT = 500

function getPinnedStorageKey(repoPath: string): string {
  return `npm-pinned-scripts-${repoPath}`
}

/**
 * Static store for running scripts that survives component remounts
 * (e.g. when switching repos and back).
 */
const globalRunningScripts = new Map<string, IRunningScriptState>()

/**
 * Global IPC listeners that capture output even when no NpmScriptsPanel
 * instance is mounted (e.g. during repo switches).
 */
let globalListenersRegistered = false

function ensureGlobalListeners() {
  if (globalListenersRegistered) {
    return
  }
  globalListenersRegistered = true

  ipcRenderer.on('npm-script-output', (_: any, id: string, data: string) => {
    const script = globalRunningScripts.get(id)
    if (script) {
      globalRunningScripts.set(id, {
        ...script,
        output: script.output + data,
      })
    }
  })

  ipcRenderer.on('npm-script-exit', (_: any, id: string, code: number | null) => {
    const script = globalRunningScripts.get(id)
    if (script) {
      globalRunningScripts.set(id, {
        ...script,
        isRunning: false,
        exitCode: code,
      })
    }
  })
}

export class NpmScriptsPanel extends React.Component<
  INpmScriptsPanelProps,
  INpmScriptsPanelState
> {
  public constructor(props: INpmScriptsPanelProps) {
    super(props)
    ensureGlobalListeners()
    this.state = {
      runningScripts: new Map(globalRunningScripts),
      expandedScript: null,
      collapsedSections: new Set(),
      pinnedScripts: new Set(
        getStringArray(getPinnedStorageKey(props.repoPath))
      ),
      height: DEFAULT_HEIGHT,
    }
  }

  private isDragging = false
  private startY = 0
  private startHeight = 0

  public componentDidMount() {
    ipcRenderer.on('npm-script-output', this.onScriptOutput)
    ipcRenderer.on('npm-script-exit', this.onScriptExit)
    document.addEventListener('mousemove', this.onResizeMove)
    document.addEventListener('mouseup', this.onResizeEnd)

    // Sync from global store periodically to pick up output
    // that arrived while this component was unmounted
    this.syncFromGlobal()
  }

  public componentDidUpdate(prevProps: INpmScriptsPanelProps) {
    if (prevProps.repoPath !== this.props.repoPath) {
      this.setState({
        pinnedScripts: new Set(
          getStringArray(getPinnedStorageKey(this.props.repoPath))
        ),
      })
    }
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('npm-script-output', this.onScriptOutput)
    ipcRenderer.removeListener('npm-script-exit', this.onScriptExit)
    document.removeEventListener('mousemove', this.onResizeMove)
    document.removeEventListener('mouseup', this.onResizeEnd)
  }

  /** Sync component state from global store (picks up output from while unmounted) */
  private syncFromGlobal() {
    if (globalRunningScripts.size > 0) {
      this.setState({ runningScripts: new Map(globalRunningScripts) })
    }
  }

  private onScriptOutput = (_: any, id: string, _data: string) => {
    // Global listener already updated globalRunningScripts.
    // Sync to component state for re-render.
    if (globalRunningScripts.has(id)) {
      this.setState({ runningScripts: new Map(globalRunningScripts) })
    }
  }

  private onScriptExit = (_: any, id: string, _code: number | null) => {
    // Global listener already updated globalRunningScripts.
    if (globalRunningScripts.has(id)) {
      this.setState({ runningScripts: new Map(globalRunningScripts) })
    }
  }

  private onRunScript = async (
    scriptName: string,
    packagePath?: string
  ) => {
    const cwd = packagePath || this.props.repoPath
    const { manager } = this.props

    const id = await ipcRenderer.invoke(
      'npm-script-start',
      cwd,
      manager,
      scriptName
    )

    const scriptEntry: IRunningScriptState = {
      id,
      scriptName,
      packagePath: cwd,
      output: '',
      exitCode: null,
      isRunning: true,
    }

    // Store in global map so it survives remounts
    globalRunningScripts.set(id, scriptEntry)

    const { runningScripts } = this.state
    const updated = new Map(runningScripts)
    const scriptKey = this.getScriptKey(scriptName, packagePath)
    updated.set(id, scriptEntry)
    this.setState({
      runningScripts: updated,
      expandedScript: scriptKey,
    })
  }

  private onStopScript = async (
    scriptName: string,
    packagePath?: string
  ) => {
    const cwd = packagePath || this.props.repoPath
    const { runningScripts } = this.state
    for (const [id, script] of runningScripts) {
      if (
        script.scriptName === scriptName &&
        script.packagePath === cwd &&
        script.isRunning
      ) {
        await ipcRenderer.invoke('npm-script-stop', id)
        break
      }
    }
  }

  private onToggleExpand = (scriptKey: string) => {
    this.setState({
      expandedScript:
        this.state.expandedScript === scriptKey ? null : scriptKey,
    })
  }

  private onToggleSection = (sectionName: string) => {
    const { collapsedSections } = this.state
    const updated = new Set(collapsedSections)
    if (updated.has(sectionName)) {
      updated.delete(sectionName)
    } else {
      updated.add(sectionName)
    }
    this.setState({ collapsedSections: updated })
  }

  private onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    this.isDragging = true
    this.startY = e.clientY
    this.startHeight = this.state.height
  }

  private onResizeMove = (e: MouseEvent) => {
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

  private onResizeEnd = () => {
    this.isDragging = false
  }

  private onTogglePin = (scriptKey: string) => {
    const { pinnedScripts } = this.state
    const updated = new Set(pinnedScripts)
    if (updated.has(scriptKey)) {
      updated.delete(scriptKey)
    } else {
      updated.add(scriptKey)
    }
    setStringArray(
      getPinnedStorageKey(this.props.repoPath),
      Array.from(updated)
    )
    this.setState({ pinnedScripts: updated })
  }

  private getScriptKey(
    scriptName: string,
    packagePath?: string
  ): string {
    return packagePath
      ? `${packagePath}:${scriptName}`
      : `root:${scriptName}`
  }

  private isScriptRunning(
    scriptName: string,
    packagePath: string
  ): boolean {
    for (const script of this.state.runningScripts.values()) {
      if (
        script.scriptName === scriptName &&
        script.packagePath === packagePath &&
        script.isRunning
      ) {
        return true
      }
    }
    return false
  }

  private getScriptOutput(
    scriptName: string,
    packagePath: string
  ): string {
    for (const script of this.state.runningScripts.values()) {
      if (
        script.scriptName === scriptName &&
        script.packagePath === packagePath
      ) {
        return script.output
      }
    }
    return ''
  }

  private getRunningCount(): number {
    let count = 0
    for (const script of this.state.runningScripts.values()) {
      if (script.isRunning) {
        count++
      }
    }
    return count
  }

  private renderScriptItem(
    name: string,
    command: string,
    packagePath: string,
    scriptKey: string
  ) {
    const isRunning = this.isScriptRunning(name, packagePath)
    const isExpanded = this.state.expandedScript === scriptKey
    const output = this.getScriptOutput(name, packagePath)
    const isPinned = this.state.pinnedScripts.has(scriptKey)

    return (
      <div key={scriptKey}>
        <ScriptItem
          name={name}
          command={command}
          isRunning={isRunning}
          isExpanded={isExpanded}
          isPinned={isPinned}
          onRun={() => this.onRunScript(name, packagePath)}
          onStop={() => this.onStopScript(name, packagePath)}
          onToggleExpand={() => this.onToggleExpand(scriptKey)}
          onTogglePin={() => this.onTogglePin(scriptKey)}
        />
        {isExpanded && output && <ScriptOutput output={output} />}
      </div>
    )
  }

  private renderScriptList(
    scripts: Record<string, string>,
    packagePath: string
  ) {
    const scriptNames = Object.keys(scripts)

    return scriptNames.map(name => {
      const scriptKey = this.getScriptKey(name, packagePath)
      return this.renderScriptItem(name, scripts[name], packagePath, scriptKey)
    })
  }

  private renderSection(
    title: string,
    scripts: Record<string, string>,
    packagePath: string
  ) {
    const sectionKey = packagePath || 'root'
    const isCollapsed = this.state.collapsedSections.has(sectionKey)
    const scriptCount = Object.keys(scripts).length

    return (
      <div key={sectionKey} className="npm-scripts-section">
        <div
          className="npm-scripts-section-header"
          onClick={() => this.onToggleSection(sectionKey)}
        >
          <span className="npm-scripts-section-arrow">
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </span>
          <span className="npm-scripts-section-title">{title}</span>
          <span className="npm-scripts-section-count">{scriptCount}</span>
        </div>
        {!isCollapsed && (
          <div className="npm-scripts-section-content">
            {this.renderScriptList(scripts, packagePath)}
          </div>
        )}
      </div>
    )
  }

  private collectAllScripts(): Array<{
    name: string
    command: string
    packagePath: string
    scriptKey: string
  }> {
    const all: Array<{
      name: string
      command: string
      packagePath: string
      scriptKey: string
    }> = []

    const { rootScripts, workspaces, repoPath } = this.props

    for (const [name, command] of Object.entries(rootScripts)) {
      all.push({
        name,
        command,
        packagePath: repoPath,
        scriptKey: this.getScriptKey(name, repoPath),
      })
    }

    for (const ws of workspaces) {
      for (const [name, command] of Object.entries(ws.scripts)) {
        all.push({
          name,
          command,
          packagePath: ws.path,
          scriptKey: this.getScriptKey(name, ws.path),
        })
      }
    }

    return all
  }

  private renderPinnedSection() {
    const { pinnedScripts } = this.state
    if (pinnedScripts.size === 0) {
      return null
    }

    const allScripts = this.collectAllScripts()
    const pinned = allScripts.filter(s => pinnedScripts.has(s.scriptKey))

    if (pinned.length === 0) {
      return null
    }

    return (
      <div className="npm-scripts-pinned">
        <div className="npm-scripts-pinned-header">
          <span className="npm-scripts-pinned-title">Pinned</span>
          <span className="npm-scripts-section-count">{pinned.length}</span>
        </div>
        <div className="npm-scripts-pinned-content">
          {pinned.map(s =>
            this.renderScriptItem(
              s.name,
              s.command,
              s.packagePath,
              s.scriptKey
            )
          )}
        </div>
      </div>
    )
  }

  public render() {
    const { rootScripts, workspaces, manager } = this.props
    const { height } = this.state
    const runningCount = this.getRunningCount()
    const hasWorkspaces = workspaces.length > 0

    return (
      <div className="npm-scripts-panel" style={{ height }}>
        <div
          className="npm-scripts-resize-handle"
          onMouseDown={this.onResizeStart}
        />
        <div className="npm-scripts-header">
          <span className="npm-scripts-title">
            Scripts ({manager})
          </span>
          {runningCount > 0 && (
            <span className="npm-scripts-badge">{runningCount}</span>
          )}
        </div>
        <div className="npm-scripts-list">
          {this.renderPinnedSection()}
          {Object.keys(rootScripts).length > 0 &&
            (hasWorkspaces
              ? this.renderSection(
                  'Root',
                  rootScripts,
                  this.props.repoPath
                )
              : this.renderScriptList(rootScripts, this.props.repoPath))}
          {workspaces.map(ws =>
            this.renderSection(ws.name, ws.scripts, ws.path)
          )}
        </div>
      </div>
    )
  }
}

import * as React from 'react'
import { ScriptItem } from './script-item'
import { ScriptOutput } from './script-output'
import { PackageManager } from '../../lib/npm/script-detector'
import * as ipcRenderer from '../../lib/ipc-renderer'

interface INpmScriptsPanelProps {
  readonly repoPath: string
  readonly scripts: Record<string, string>
  readonly manager: PackageManager
}

interface IRunningScriptState {
  readonly id: string
  readonly scriptName: string
  readonly output: string
  readonly exitCode: number | null
  readonly isRunning: boolean
}

interface INpmScriptsPanelState {
  readonly runningScripts: Map<string, IRunningScriptState>
  readonly expandedScript: string | null
}

export class NpmScriptsPanel extends React.Component<
  INpmScriptsPanelProps,
  INpmScriptsPanelState
> {
  public constructor(props: INpmScriptsPanelProps) {
    super(props)
    this.state = {
      runningScripts: new Map(),
      expandedScript: null,
    }
  }

  public componentDidMount() {
    ipcRenderer.on('npm-script-output', this.onScriptOutput)
    ipcRenderer.on('npm-script-exit', this.onScriptExit)
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('npm-script-output', this.onScriptOutput)
    ipcRenderer.removeListener('npm-script-exit', this.onScriptExit)
  }

  private onScriptOutput = (_: any, id: string, data: string) => {
    const { runningScripts } = this.state
    const script = runningScripts.get(id)
    if (script) {
      const updated = new Map(runningScripts)
      updated.set(id, {
        ...script,
        output: script.output + data,
      })
      this.setState({ runningScripts: updated })
    }
  }

  private onScriptExit = (_: any, id: string, code: number | null) => {
    const { runningScripts } = this.state
    const script = runningScripts.get(id)
    if (script) {
      const updated = new Map(runningScripts)
      updated.set(id, {
        ...script,
        isRunning: false,
        exitCode: code,
      })
      this.setState({ runningScripts: updated })
    }
  }

  private onRunScript = async (scriptName: string) => {
    const { repoPath, manager } = this.props

    const id = await ipcRenderer.invoke(
      'npm-script-start',
      repoPath,
      manager,
      scriptName
    )

    const { runningScripts } = this.state
    const updated = new Map(runningScripts)
    updated.set(id, {
      id,
      scriptName,
      output: '',
      exitCode: null,
      isRunning: true,
    })
    this.setState({
      runningScripts: updated,
      expandedScript: scriptName,
    })
  }

  private onStopScript = async (scriptName: string) => {
    const { runningScripts } = this.state
    for (const [id, script] of runningScripts) {
      if (script.scriptName === scriptName && script.isRunning) {
        await ipcRenderer.invoke('npm-script-stop', id)
        break
      }
    }
  }

  private onToggleExpand = (scriptName: string) => {
    this.setState({
      expandedScript:
        this.state.expandedScript === scriptName ? null : scriptName,
    })
  }

  private isScriptRunning(scriptName: string): boolean {
    for (const script of this.state.runningScripts.values()) {
      if (script.scriptName === scriptName && script.isRunning) {
        return true
      }
    }
    return false
  }

  private getScriptOutput(scriptName: string): string {
    for (const script of this.state.runningScripts.values()) {
      if (script.scriptName === scriptName) {
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

  public render() {
    const { scripts, manager } = this.props
    const scriptNames = Object.keys(scripts)
    const runningCount = this.getRunningCount()

    return (
      <div className="npm-scripts-panel">
        <div className="npm-scripts-header">
          <span className="npm-scripts-title">
            Scripts ({manager})
          </span>
          {runningCount > 0 && (
            <span className="npm-scripts-badge">{runningCount}</span>
          )}
        </div>
        <div className="npm-scripts-list">
          {scriptNames.map(name => {
            const isRunning = this.isScriptRunning(name)
            const isExpanded = this.state.expandedScript === name
            const output = this.getScriptOutput(name)

            return (
              <div key={name}>
                <ScriptItem
                  name={name}
                  command={scripts[name]}
                  isRunning={isRunning}
                  isExpanded={isExpanded}
                  onRun={this.onRunScript}
                  onStop={this.onStopScript}
                  onToggleExpand={this.onToggleExpand}
                />
                {isExpanded && output && <ScriptOutput output={output} />}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
}

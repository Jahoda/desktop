import * as React from 'react'
import classNames from 'classnames'

interface IScriptItemProps {
  readonly name: string
  readonly command: string
  readonly isRunning: boolean
  readonly isExpanded: boolean
  readonly onRun: (name: string) => void
  readonly onStop: (name: string) => void
  readonly onToggleExpand: (name: string) => void
}

export class ScriptItem extends React.Component<IScriptItemProps> {
  private onPlayStop = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (this.props.isRunning) {
      this.props.onStop(this.props.name)
    } else {
      this.props.onRun(this.props.name)
    }
  }

  private onClick = () => {
    this.props.onToggleExpand(this.props.name)
  }

  public render() {
    const { name, command, isRunning, isExpanded } = this.props

    const className = classNames('script-item', {
      running: isRunning,
      expanded: isExpanded,
    })

    return (
      <div className={className} onClick={this.onClick}>
        <button
          className={classNames('script-action-btn', {
            'script-stop-btn': isRunning,
            'script-play-btn': !isRunning,
          })}
          onClick={this.onPlayStop}
          title={isRunning ? 'Stop' : 'Run'}
        >
          {isRunning ? '■' : '▶'}
        </button>
        <div className="script-info">
          <span className="script-name">{name}</span>
          <span className="script-command" title={command}>
            {command}
          </span>
        </div>
        {isRunning && <span className="script-running-indicator" />}
      </div>
    )
  }
}

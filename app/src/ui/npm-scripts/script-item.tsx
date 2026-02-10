import * as React from 'react'
import classNames from 'classnames'

interface IScriptItemProps {
  readonly name: string
  readonly command: string
  readonly isRunning: boolean
  readonly isExpanded: boolean
  readonly isPinned: boolean
  readonly onRun: () => void
  readonly onStop: () => void
  readonly onToggleExpand: () => void
  readonly onTogglePin: () => void
  /** Workspace/package name shown for pinned scripts in monorepo */
  readonly packageLabel?: string
}

export class ScriptItem extends React.Component<IScriptItemProps> {
  private onPlayStop = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (this.props.isRunning) {
      this.props.onStop()
    } else {
      this.props.onRun()
    }
  }

  private onTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    this.props.onTogglePin()
  }

  private onClick = () => {
    this.props.onToggleExpand()
  }

  public render() {
    const { name, command, isRunning, isExpanded, isPinned, packageLabel } =
      this.props

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
          {isRunning ? '\u25A0' : '\u25B6'}
        </button>
        <div className="script-info">
          <span className="script-name">
            {packageLabel && (
              <span className="script-package-label">{packageLabel}/</span>
            )}
            {name}
          </span>
          <span className="script-command" title={command}>
            {command}
          </span>
        </div>
        <button
          className={classNames('script-pin-btn', { pinned: isPinned })}
          onClick={this.onTogglePin}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          {'\u2605'}
        </button>
        {isRunning && <span className="script-running-indicator" />}
      </div>
    )
  }
}

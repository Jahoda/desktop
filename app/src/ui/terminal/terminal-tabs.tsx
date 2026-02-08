import * as React from 'react'
import classNames from 'classnames'

export interface ITerminalTab {
  readonly id: string
  readonly title: string
}

interface ITerminalTabsProps {
  readonly tabs: ReadonlyArray<ITerminalTab>
  readonly activeTabId: string | null
  readonly onTabClicked: (id: string) => void
  readonly onTabClosed: (id: string) => void
  readonly onNewTab: () => void
}

export class TerminalTabs extends React.Component<ITerminalTabsProps> {
  public render() {
    const { tabs, activeTabId } = this.props

    return (
      <div className="terminal-tabs">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={classNames('terminal-tab', {
              active: tab.id === activeTabId,
            })}
            onClick={() => this.props.onTabClicked(tab.id)}
          >
            <span className="terminal-tab-title">
              {tab.title || `Terminal ${index + 1}`}
            </span>
            <button
              className="terminal-tab-close"
              onClick={e => {
                e.stopPropagation()
                this.props.onTabClosed(tab.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="terminal-new-tab-btn"
          onClick={this.props.onNewTab}
          title="New Terminal"
        >
          +
        </button>
      </div>
    )
  }
}

import * as React from 'react'
import { ITabState } from '../../lib/app-state'
import classNames from 'classnames'
import { RepoIcon } from './repo-icon'

interface ITabItemProps {
  readonly tab: ITabState
  readonly index: number
  readonly isActive: boolean
  readonly isDragging: boolean
  readonly isDragOver: boolean
  readonly onTabClicked: (index: number) => void
  readonly onTabClosed: (index: number) => void
  readonly onDragStart: (index: number) => void
  readonly onDragOver: (index: number) => void
  readonly onDrop: (index: number) => void
  readonly onDragEnd: () => void
}

export class TabItem extends React.Component<ITabItemProps> {
  private onClick = () => {
    this.props.onTabClicked(this.props.index)
  }

  private onMouseUp = (e: React.MouseEvent) => {
    // Middle mouse button closes tab
    if (e.button === 1) {
      e.preventDefault()
      this.props.onTabClosed(this.props.index)
    }
  }

  private onClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    this.props.onTabClosed(this.props.index)
  }

  private onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(this.props.index))
    this.props.onDragStart(this.props.index)
  }

  private onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    this.props.onDragOver(this.props.index)
  }

  private onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    this.props.onDrop(this.props.index)
  }

  private onDragEnd = () => {
    this.props.onDragEnd()
  }

  public render() {
    const { tab, isActive, isDragging, isDragOver } = this.props
    const repoName = tab.repository.name
    const branchName = tab.branchName

    const className = classNames('tab-item', {
      active: isActive,
      dragging: isDragging,
      'drag-over': isDragOver,
    })

    return (
      <div
        className={className}
        onClick={this.onClick}
        onMouseUp={this.onMouseUp}
        draggable={true}
        onDragStart={this.onDragStart}
        onDragOver={this.onDragOver}
        onDrop={this.onDrop}
        onDragEnd={this.onDragEnd}
      >
        <RepoIcon repository={tab.repository} />
        <div className="tab-content">
          <span className="tab-name" title={repoName}>
            {repoName}
          </span>
          {branchName && (
            <span className="tab-branch" title={branchName}>
              {branchName}
            </span>
          )}
        </div>
        <button
          className="tab-close"
          onClick={this.onClose}
          aria-label="Close tab"
        >
          ×
        </button>
      </div>
    )
  }
}

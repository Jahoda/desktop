import * as React from 'react'
import { ITabState } from '../../lib/app-state'
import { TabItem } from './tab-item'

interface ITabBarProps {
  readonly tabs: ReadonlyArray<ITabState>
  readonly activeTabIndex: number
  readonly onTabClicked: (index: number) => void
  readonly onTabClosed: (index: number) => void
  readonly onTabMoved: (fromIndex: number, toIndex: number) => void
  readonly onTabDoubleClicked?: (index: number) => void
}

interface ITabBarState {
  readonly dragIndex: number | null
  readonly dragOverIndex: number | null
}

export class TabBar extends React.Component<ITabBarProps, ITabBarState> {
  public constructor(props: ITabBarProps) {
    super(props)
    this.state = {
      dragIndex: null,
      dragOverIndex: null,
    }
  }

  private onDragStart = (index: number) => {
    this.setState({ dragIndex: index })
  }

  private onDragOver = (index: number) => {
    this.setState({ dragOverIndex: index })
  }

  private onDrop = (index: number) => {
    const { dragIndex } = this.state
    if (dragIndex !== null && dragIndex !== index) {
      this.props.onTabMoved(dragIndex, index)
    }
    this.setState({ dragIndex: null, dragOverIndex: null })
  }

  private onDragEnd = () => {
    this.setState({ dragIndex: null, dragOverIndex: null })
  }

  public render() {
    const { tabs, activeTabIndex } = this.props

    if (tabs.length <= 1) {
      return null
    }

    return (
      <div className="tab-bar-container">
        {tabs.map((tab, index) => (
          <TabItem
            key={`tab-${tab.repository.id}-${index}`}
            tab={tab}
            index={index}
            isActive={index === activeTabIndex}
            isDragging={this.state.dragIndex === index}
            isDragOver={this.state.dragOverIndex === index}
            onTabClicked={this.props.onTabClicked}
            onTabClosed={this.props.onTabClosed}
            onDragStart={this.onDragStart}
            onDragOver={this.onDragOver}
            onDrop={this.onDrop}
            onDragEnd={this.onDragEnd}
          />
        ))}
      </div>
    )
  }
}

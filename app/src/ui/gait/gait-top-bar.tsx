import * as React from 'react'
import { IGaitState } from '../../lib/gait/gait-state'
import { FoldoutType } from '../../lib/app-state'
import { Dispatcher } from '../dispatcher'
import { DropdownState } from '../toolbar'
import { TabBar } from '../tabs/tab-bar'

/**
 * Gait replaces the upstream "Current repository" toolbar dropdown with
 * repository tabs. The repository list opens in a foldout below the tab bar.
 */
export const showRepositoryToolbarDropdown = false

interface IGaitTopBarProps {
  readonly dispatcher: Dispatcher
  readonly gait: IGaitState
  readonly isRepositoryFoldoutOpen: boolean
  readonly renderRepositoryList: () => JSX.Element
  readonly onRepositoryDropdownStateChanged: (newState: DropdownState) => void
}

/** Repository tab bar and the repository list foldout */
export class GaitTopBar extends React.Component<IGaitTopBarProps> {
  private onTabClicked = (index: number) => {
    this.props.dispatcher.gait.selectTab(index)
  }

  private onTabClosed = (index: number) => {
    this.props.dispatcher.gait.closeTab(index)
  }

  private onTabMoved = (fromIndex: number, toIndex: number) => {
    this.props.dispatcher.gait.moveTab(fromIndex, toIndex)
  }

  private onAddRepository = () => {
    this.props.onRepositoryDropdownStateChanged('open')
  }

  private onOverlayClicked = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
  }

  private renderRepositoryFoldout() {
    if (!this.props.isRepositoryFoldoutOpen) {
      return null
    }

    return (
      <div className="repository-foldout-panel">
        <div
          className="repository-foldout-overlay"
          onClick={this.onOverlayClicked}
        />
        <div className="repository-foldout-content">
          {this.props.renderRepositoryList()}
        </div>
      </div>
    )
  }

  public render() {
    const { openTabs, activeTabIndex } = this.props.gait

    return (
      <>
        <TabBar
          tabs={openTabs}
          activeTabIndex={activeTabIndex}
          onTabClicked={this.onTabClicked}
          onTabClosed={this.onTabClosed}
          onTabMoved={this.onTabMoved}
          onAddRepository={this.onAddRepository}
        />
        {this.renderRepositoryFoldout()}
      </>
    )
  }
}

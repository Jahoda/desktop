import * as React from 'react'
import { PossibleSelections, SelectionType } from '../../lib/app-state'
import { PopupType } from '../../models/popup'
import { TipState } from '../../models/tip'
import { Dispatcher } from '../dispatcher'
import * as octicons from '../octicons/octicons.generated'
import { ToolbarButton, ToolbarButtonStyle } from '../toolbar/button'

interface IGaitGitActionsProps {
  readonly dispatcher: Dispatcher
  readonly selectedState: PossibleSelections | null
}

/** Toolbar buttons for pull --rebase, rebase on main and reset to origin */
export class GaitGitActions extends React.Component<IGaitGitActionsProps> {
  private onPullRebase = () => {
    const selection = this.props.selectedState
    if (!selection || selection.type !== SelectionType.Repository) {
      return
    }
    this.props.dispatcher.gait.pullRebase(selection.repository)
  }

  private onRebaseOnMain = () => {
    const selection = this.props.selectedState
    if (!selection || selection.type !== SelectionType.Repository) {
      return
    }
    this.props.dispatcher.gait.rebaseOntoDefaultBranch(selection.repository)
  }

  private onResetToOrigin = () => {
    const selection = this.props.selectedState
    if (!selection || selection.type !== SelectionType.Repository) {
      return
    }

    const { tip } = selection.state.branchesState
    if (tip.kind !== TipState.Valid) {
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmResetToOrigin,
      repository: selection.repository,
      branchName: tip.branch.name,
    })
  }

  public render() {
    const selection = this.props.selectedState
    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const { state } = selection
    const { tip } = state.branchesState
    const disabled =
      state.isPushPullFetchInProgress || tip.kind !== TipState.Valid

    return (
      <>
        <ToolbarButton
          title="Pull rebase"
          description="Fetch & pull --rebase"
          icon={octicons.repoPull}
          style={ToolbarButtonStyle.Subtitle}
          className="git-action-button"
          disabled={disabled}
          onClick={this.onPullRebase}
        />
        <ToolbarButton
          title="Rebase on main"
          description="Fetch & rebase origin/main"
          icon={octicons.gitBranch}
          style={ToolbarButtonStyle.Subtitle}
          className="git-action-button"
          disabled={disabled}
          onClick={this.onRebaseOnMain}
        />
        <ToolbarButton
          title="Reset to origin"
          description="Reset branch to origin"
          icon={octicons.alert}
          style={ToolbarButtonStyle.Subtitle}
          className="git-action-button"
          disabled={disabled}
          onClick={this.onResetToOrigin}
        />
      </>
    )
  }
}

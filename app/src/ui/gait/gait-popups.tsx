import * as React from 'react'
import {
  IGHDAccount,
  IGHDPreferences,
} from '../../lib/import/github-desktop-importer'
import { Popup, PopupType } from '../../models/popup'
import { Dispatcher } from '../dispatcher'
import { FileEditorDialog } from '../file-editor/file-editor-dialog'
import { ImportFromGitHubDesktop } from '../import/import-from-github-desktop'
import { ConfirmResetToOrigin } from '../reset-to-origin/confirm-reset-to-origin'

type GaitPopupType =
  | PopupType.ImportFromGitHubDesktop
  | PopupType.FileEditor
  | PopupType.ConfirmResetToOrigin

export type GaitPopup = Extract<Popup, { type: GaitPopupType }>

const gaitPopupTypes: ReadonlyArray<GaitPopupType> = [
  PopupType.ImportFromGitHubDesktop,
  PopupType.FileEditor,
  PopupType.ConfirmResetToOrigin,
]

export function isGaitPopup(popup: Popup): popup is GaitPopup {
  return (gaitPopupTypes as ReadonlyArray<PopupType>).includes(popup.type)
}

interface IGaitPopupContentProps {
  readonly popup: GaitPopup
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

/** Renders the Gait-specific popups */
export class GaitPopupContent extends React.Component<IGaitPopupContentProps> {
  private onImportFromGitHubDesktop = async (
    accounts: ReadonlyArray<IGHDAccount>,
    repositories: ReadonlyArray<string>,
    preferences: IGHDPreferences | null
  ) => {
    await this.props.dispatcher.gait.importFromGitHubDesktop(
      accounts,
      repositories,
      preferences
    )
  }

  public render() {
    const { popup, dispatcher, onDismissed } = this.props

    switch (popup.type) {
      case PopupType.ImportFromGitHubDesktop:
        return (
          <ImportFromGitHubDesktop
            key="import-from-github-desktop"
            onDismissed={onDismissed}
            onImport={this.onImportFromGitHubDesktop}
          />
        )
      case PopupType.FileEditor:
        return (
          <FileEditorDialog
            key="file-editor"
            repository={popup.repository}
            file={popup.file}
            dispatcher={dispatcher}
            onDismissed={onDismissed}
          />
        )
      case PopupType.ConfirmResetToOrigin:
        return (
          <ConfirmResetToOrigin
            key="confirm-reset-to-origin"
            dispatcher={dispatcher}
            repository={popup.repository}
            branchName={popup.branchName}
            onDismissed={onDismissed}
          />
        )
    }
  }
}

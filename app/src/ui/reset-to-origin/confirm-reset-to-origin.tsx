import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { DialogFooter, DialogContent, Dialog } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IConfirmResetToOriginProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branchName: string
  readonly onDismissed: () => void
}

export class ConfirmResetToOrigin extends React.Component<IConfirmResetToOriginProps> {
  public render() {
    return (
      <Dialog
        title="Reset to origin?"
        dismissDisabled={false}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onReset}
        type="warning"
      >
        <DialogContent>
          <p>
            This will reset <Ref>{this.props.branchName}</Ref> to match{' '}
            <Ref>origin/{this.props.branchName}</Ref>.
          </p>
          <p>
            All local commits and uncommitted changes on this branch will be
            permanently lost. This action cannot be undone.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Reset to origin"
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onReset = async () => {
    this.props.onDismissed()
    await this.props.dispatcher.gait.resetToOrigin(this.props.repository)
  }
}

import * as React from 'react'
import * as Path from 'path'
import { readFile, writeFile } from 'fs/promises'

import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { CodeMirrorEditor } from './code-mirror-editor'
import { Loading } from '../lib/loading'

interface IFileEditorDialogProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IFileEditorDialogState {
  readonly content: string
  readonly originalContent: string
  readonly isLoading: boolean
  readonly isSaving: boolean
  readonly loadError: Error | null
  readonly isDirty: boolean
}

export class FileEditorDialog extends React.Component<
  IFileEditorDialogProps,
  IFileEditorDialogState
> {
  public constructor(props: IFileEditorDialogProps) {
    super(props)
    this.state = {
      content: '',
      originalContent: '',
      isLoading: true,
      isSaving: false,
      loadError: null,
      isDirty: false,
    }
  }

  public async componentDidMount() {
    const fullPath = Path.join(this.props.repository.path, this.props.file.path)
    try {
      const content = await readFile(fullPath, 'utf8')
      this.setState({
        content,
        originalContent: content,
        isLoading: false,
      })
    } catch (e) {
      this.setState({
        isLoading: false,
        loadError: e instanceof Error ? e : new Error(String(e)),
      })
    }
  }

  private onContentChanged = (content: string) => {
    this.setState({
      content,
      isDirty: content !== this.state.originalContent,
    })
  }

  private onSave = async () => {
    this.setState({ isSaving: true })
    const fullPath = Path.join(this.props.repository.path, this.props.file.path)
    try {
      await writeFile(fullPath, this.state.content, 'utf8')
      this.props.dispatcher.refreshRepository(this.props.repository)
      this.props.onDismissed()
    } catch (e) {
      this.setState({ isSaving: false })
    }
  }

  public render() {
    return (
      <Dialog
        id="file-editor"
        title={this.props.file.path}
        onDismissed={this.props.onDismissed}
        onSubmit={this.state.isDirty ? this.onSave : undefined}
        className="file-editor-dialog"
      >
        <DialogContent>{this.renderContent()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Save"
            okButtonDisabled={!this.state.isDirty || this.state.isSaving}
            cancelButtonText="Cancel"
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderContent() {
    if (this.state.isLoading) {
      return <Loading />
    }

    if (this.state.loadError) {
      return (
        <div className="file-editor-error">
          Failed to load file: {this.state.loadError.message}
        </div>
      )
    }

    return (
      <CodeMirrorEditor
        content={this.state.content}
        filePath={this.props.file.path}
        onContentChanged={this.onContentChanged}
      />
    )
  }
}

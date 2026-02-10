import * as React from 'react'
import * as Path from 'path'
import { ipcRenderer, clipboard } from 'electron'

interface ICodeBlockProps {
  readonly code: string
  readonly language: string
  readonly filePath: string | null
  readonly cwd: string
}

interface ICodeBlockState {
  readonly copied: boolean
  readonly applied: boolean
}

/**
 * Syntax-highlighted code block with copy and apply buttons.
 */
export class CodeBlock extends React.Component<
  ICodeBlockProps,
  ICodeBlockState
> {
  public constructor(props: ICodeBlockProps) {
    super(props)
    this.state = { copied: false, applied: false }
  }

  private onCopy = () => {
    clipboard.writeText(this.props.code)
    this.setState({ copied: true })
    setTimeout(() => this.setState({ copied: false }), 2000)
  }

  private onApply = async () => {
    const { filePath, code, cwd } = this.props
    if (!filePath) {
      return
    }

    const fullPath = Path.isAbsolute(filePath)
      ? filePath
      : Path.join(cwd, filePath)

    try {
      await ipcRenderer.invoke('claude-apply-code', fullPath, code)
      this.setState({ applied: true })
      setTimeout(() => this.setState({ applied: false }), 2000)
    } catch (err) {
      console.error('Failed to apply code:', err)
    }
  }

  public render() {
    const { code, language, filePath } = this.props
    const { copied, applied } = this.state

    return (
      <div className="claude-code-block">
        <div className="claude-code-block-header">
          <span className="claude-code-block-lang">
            {filePath || language || 'code'}
          </span>
          <div className="claude-code-block-actions">
            {filePath && (
              <button
                className="claude-code-block-btn"
                onClick={this.onApply}
                title="Apply to file"
              >
                {applied ? 'Applied!' : 'Apply'}
              </button>
            )}
            <button
              className="claude-code-block-btn"
              onClick={this.onCopy}
              title="Copy code"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <pre className="claude-code-block-content">
          <code>{code}</code>
        </pre>
      </div>
    )
  }
}

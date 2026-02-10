import * as React from 'react'

interface IChatInputProps {
  readonly isStreaming: boolean
  readonly onSend: (message: string) => void
  readonly onAbort: () => void
}

interface IChatInputState {
  readonly value: string
}

/**
 * Auto-resizing chat input with send/abort buttons.
 */
export class ChatInput extends React.Component<
  IChatInputProps,
  IChatInputState
> {
  private textareaRef = React.createRef<HTMLTextAreaElement>()

  public constructor(props: IChatInputProps) {
    super(props)
    this.state = { value: '' }
  }

  private resizeTextarea() {
    const textarea = this.textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }

  private onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ value: e.target.value }, () => this.resizeTextarea())
  }

  private onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      this.handleSend()
    }
  }

  private handleSend = () => {
    const trimmed = this.state.value.trim()
    if (!trimmed || this.props.isStreaming) {
      return
    }

    this.props.onSend(trimmed)
    this.setState({ value: '' }, () => this.resizeTextarea())
  }

  public render() {
    const { isStreaming, onAbort } = this.props
    const { value } = this.state

    return (
      <div className="claude-chat-input-area">
        <textarea
          ref={this.textareaRef}
          className="claude-chat-textarea"
          value={value}
          onChange={this.onChange}
          onKeyDown={this.onKeyDown}
          placeholder="Ask Claude..."
          rows={1}
          disabled={isStreaming}
        />
        <div className="claude-chat-input-buttons">
          {isStreaming ? (
            <button
              className="claude-chat-abort-btn"
              onClick={onAbort}
              title="Stop generation"
            >
              Stop
            </button>
          ) : (
            <button
              className="claude-chat-send-btn"
              onClick={this.handleSend}
              disabled={!value.trim()}
              title="Send message"
            >
              Send
            </button>
          )}
        </div>
      </div>
    )
  }
}

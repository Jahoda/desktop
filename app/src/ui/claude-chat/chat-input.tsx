import * as React from 'react'
import { ipcRenderer } from 'electron'

interface IChatInputProps {
  readonly isStreaming: boolean
  readonly onSend: (message: string, imagePaths?: string[]) => void
  readonly onAbort: () => void
}

interface IChatInputState {
  readonly value: string
  readonly pendingImages: string[]
}

/**
 * Auto-resizing chat input with send/abort buttons and image paste support.
 */
export class ChatInput extends React.Component<
  IChatInputProps,
  IChatInputState
> {
  private textareaRef = React.createRef<HTMLTextAreaElement>()

  public constructor(props: IChatInputProps) {
    super(props)
    this.state = { value: '', pendingImages: [] }
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

  private onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault()
        const blob = items[i].getAsFile()
        if (!blob) {
          return
        }
        const buffer = await blob.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        )
        try {
          const filePath: string = await ipcRenderer.invoke(
            'claude-save-image',
            base64
          )
          this.setState(prev => ({
            pendingImages: [...prev.pendingImages, filePath],
          }))
        } catch (err) {
          console.error('[chat-input] Failed to save pasted image:', err)
        }
        return
      }
    }
  }

  private removeImage = (index: number) => {
    this.setState(prev => ({
      pendingImages: prev.pendingImages.filter((_, i) => i !== index),
    }))
  }

  private handleSend = () => {
    const { pendingImages } = this.state
    const trimmed = this.state.value.trim()
    if ((!trimmed && pendingImages.length === 0) || this.props.isStreaming) {
      return
    }

    this.props.onSend(
      trimmed || 'What is in this image?',
      pendingImages.length > 0 ? pendingImages : undefined
    )
    this.setState({ value: '', pendingImages: [] }, () =>
      this.resizeTextarea()
    )
  }

  public render() {
    const { isStreaming, onAbort } = this.props
    const { value, pendingImages } = this.state

    return (
      <div className="claude-chat-input-area">
        {pendingImages.length > 0 && (
          <div className="claude-chat-pending-images">
            {pendingImages.map((imgPath, i) => (
              <div key={i} className="claude-chat-pending-image">
                <img src={`file://${imgPath}`} alt="Pending" />
                <button
                  className="claude-chat-pending-image-remove"
                  onClick={() => this.removeImage(i)}
                  title="Remove image"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="claude-chat-input-row">
          <textarea
            ref={this.textareaRef}
            className="claude-chat-textarea"
            value={value}
            onChange={this.onChange}
            onKeyDown={this.onKeyDown}
            onPaste={this.onPaste}
            placeholder={
              pendingImages.length > 0
                ? 'Add a message or send the image...'
                : 'Ask Claude...'
            }
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
                disabled={!value.trim() && pendingImages.length === 0}
                title="Send message"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}

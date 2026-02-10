import * as React from 'react'
import { ipcRenderer } from 'electron'
import { ChatMessage, IChatMessage } from './chat-message'
import { ChatInput } from './chat-input'

interface IClaudeChatPanelProps {
  readonly cwd: string
  readonly repoId: number
  readonly branchName: string | null
}

interface IClaudeChatPanelState {
  readonly width: number
  readonly collapsed: boolean
}

/** Per-repo chat state preserved across component re-mounts */
interface IRepoChatState {
  messages: IChatMessage[]
  sessionId: string | null
  isStreaming: boolean
}

const MIN_WIDTH = 280
const DEFAULT_WIDTH = 400
const MAX_WIDTH = 800

/**
 * Claude Chat panel that appears on the right side of the app.
 * Preserves chat state per-repo in a static Map.
 */
export class ClaudeChatPanel extends React.Component<
  IClaudeChatPanelProps,
  IClaudeChatPanelState
> {
  private static repoChatState = new Map<number, IRepoChatState>()

  /** Track the current streaming text for the assistant message being built */
  private static streamingText = new Map<number, string>()

  /** Buffer stderr output per repo so we can show it on failure */
  private static stderrBuffer = new Map<number, string>()

  private isDragging = false
  private startX = 0
  private startWidth = 0
  private messagesEndRef = React.createRef<HTMLDivElement>()

  public constructor(props: IClaudeChatPanelProps) {
    super(props)
    this.state = {
      width: DEFAULT_WIDTH,
      collapsed: false,
    }
  }

  public componentDidMount() {
    ipcRenderer.on('claude-stream-event', this.onStreamEvent)
    ipcRenderer.on('claude-complete', this.onComplete)
    ipcRenderer.on('claude-error', this.onError)
    ipcRenderer.on('claude-stderr', this.onStderr)

    this.ensureSession()

    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mouseup', this.onMouseUp)
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('claude-stream-event', this.onStreamEvent)
    ipcRenderer.removeListener('claude-complete', this.onComplete)
    ipcRenderer.removeListener('claude-error', this.onError)
    ipcRenderer.removeListener('claude-stderr', this.onStderr)

    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mouseup', this.onMouseUp)
  }

  public componentDidUpdate(prevProps: IClaudeChatPanelProps) {
    if (prevProps.repoId !== this.props.repoId) {
      this.ensureSession()
      this.forceUpdate()
    }
  }

  private onStreamEvent = (_: any, sessionId: string, event: any) => {
    this.handleStreamEvent(sessionId, event)
  }

  private onComplete = (_: any, sessionId: string, _code: number | null) => {
    this.handleComplete(sessionId)
  }

  private onError = (_: any, sessionId: string, error: any) => {
    this.handleError(sessionId, error)
  }

  private onStderr = (_: any, sessionId: string, text: string) => {
    const repoId = this.findRepoIdForSession(sessionId)
    if (repoId === null) {
      return
    }
    const existing = ClaudeChatPanel.stderrBuffer.get(repoId) || ''
    ClaudeChatPanel.stderrBuffer.set(repoId, existing + text)
  }

  private getRepoChatState(): IRepoChatState {
    return ClaudeChatPanel.repoChatState.get(this.props.repoId) || {
      messages: [],
      sessionId: null,
      isStreaming: false,
    }
  }

  private setRepoChatState(state: IRepoChatState) {
    ClaudeChatPanel.repoChatState.set(this.props.repoId, state)
    this.forceUpdate()
  }

  private async ensureSession() {
    const chatState = this.getRepoChatState()
    if (!chatState.sessionId) {
      const sessionId: string = await ipcRenderer.invoke(
        'claude-create-session',
        this.props.cwd
      )
      this.setRepoChatState({ ...chatState, sessionId })
    }
  }

  /** Find the repoId that owns a given sessionId */
  private findRepoIdForSession(sessionId: string): number | null {
    for (const [repoId, state] of ClaudeChatPanel.repoChatState) {
      if (state.sessionId === sessionId) {
        return repoId
      }
    }
    return null
  }

  private handleStreamEvent(sessionId: string, event: any) {
    const repoId = this.findRepoIdForSession(sessionId)
    if (repoId === null) {
      return
    }

    // Handle different event types from Claude stream-json
    if (event.type === 'assistant' && event.message) {
      // Initial assistant message - set up accumulator
      const textContent = event.message.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('') || ''
      ClaudeChatPanel.streamingText.set(repoId, textContent)
      this.updateAssistantMessage(repoId, textContent)
    } else if (event.type === 'content_block_delta') {
      // Streaming text delta
      if (event.delta?.type === 'text_delta' && event.delta?.text) {
        const current = ClaudeChatPanel.streamingText.get(repoId) || ''
        const updated = current + event.delta.text
        ClaudeChatPanel.streamingText.set(repoId, updated)
        this.updateAssistantMessage(repoId, updated)
      }
    } else if (event.type === 'result') {
      // Final result - use the complete text
      const resultText = event.result
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('')
      if (resultText) {
        ClaudeChatPanel.streamingText.set(repoId, resultText)
        this.updateAssistantMessage(repoId, resultText)
      }
    }
  }

  private updateAssistantMessage(repoId: number, text: string) {
    const state = ClaudeChatPanel.repoChatState.get(repoId)
    if (!state) {
      return
    }

    const messages = [...state.messages]
    const lastMsg = messages[messages.length - 1]

    if (lastMsg && lastMsg.role === 'assistant') {
      // Update existing assistant message
      messages[messages.length - 1] = { role: 'assistant', content: text }
    } else {
      // Add new assistant message
      messages.push({ role: 'assistant', content: text })
    }

    ClaudeChatPanel.repoChatState.set(repoId, { ...state, messages })

    if (repoId === this.props.repoId) {
      this.forceUpdate(() => this.scrollToBottom())
    }
  }

  private handleComplete(sessionId: string) {
    const repoId = this.findRepoIdForSession(sessionId)
    if (repoId === null) {
      return
    }

    ClaudeChatPanel.streamingText.delete(repoId)

    const state = ClaudeChatPanel.repoChatState.get(repoId)
    if (state) {
      // If process completed without producing any assistant message,
      // check stderr messages and show a fallback error
      const lastMsg = state.messages[state.messages.length - 1]
      if (lastMsg && lastMsg.role === 'user') {
        const stderrText = ClaudeChatPanel.stderrBuffer.get(repoId)
        const errorContent = stderrText
          ? `**Error:** ${stderrText}`
          : '**Error:** No response from Claude CLI. Make sure it is installed and authenticated (`claude` in your terminal).'
        ClaudeChatPanel.repoChatState.set(repoId, {
          ...state,
          isStreaming: false,
          messages: [
            ...state.messages,
            { role: 'assistant', content: errorContent },
          ],
        })
      } else {
        ClaudeChatPanel.repoChatState.set(repoId, {
          ...state,
          isStreaming: false,
        })
      }
    }

    ClaudeChatPanel.stderrBuffer.delete(repoId)

    if (repoId === this.props.repoId) {
      this.forceUpdate()
    }
  }

  private handleError(sessionId: string, error: any) {
    const repoId = this.findRepoIdForSession(sessionId)
    if (repoId === null) {
      return
    }

    const state = ClaudeChatPanel.repoChatState.get(repoId)
    if (!state) {
      return
    }

    const errorMessage = error?.message || 'An error occurred'
    const messages = [
      ...state.messages,
      { role: 'assistant' as const, content: `**Error:** ${errorMessage}` },
    ]
    ClaudeChatPanel.repoChatState.set(repoId, {
      ...state,
      messages,
      isStreaming: false,
    })

    ClaudeChatPanel.streamingText.delete(repoId)
    ClaudeChatPanel.stderrBuffer.delete(repoId)

    if (repoId === this.props.repoId) {
      this.forceUpdate(() => this.scrollToBottom())
    }
  }

  private scrollToBottom() {
    this.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  private onSend = async (message: string, imagePaths?: string[]) => {
    const chatState = this.getRepoChatState()
    if (!chatState.sessionId) {
      return
    }

    // Add user message
    const messages: IChatMessage[] = [
      ...chatState.messages,
      {
        role: 'user' as const,
        content: message,
        images: imagePaths && imagePaths.length > 0 ? imagePaths : undefined,
      },
    ]
    this.setRepoChatState({ ...chatState, messages, isStreaming: true })

    // Build system prompt with repo context
    const systemPrompt = this.buildSystemPrompt()

    try {
      await ipcRenderer.invoke(
        'claude-send-prompt',
        chatState.sessionId,
        message,
        chatState.messages.length === 0 ? systemPrompt : undefined,
        imagePaths
      )
    } catch (err: any) {
      this.handleError(chatState.sessionId!, {
        message: err?.message || 'Failed to send prompt',
      })
    }

    this.scrollToBottom()
  }

  private buildSystemPrompt(): string {
    const { cwd, branchName } = this.props
    let prompt = `You are helping the user with a code repository at: ${cwd}`
    if (branchName) {
      prompt += `\nCurrent branch: ${branchName}`
    }
    prompt +=
      '\nWhen suggesting code changes, include the file path in the code fence like ```ts:src/file.ts or add a // file: path comment on the first line.'
    return prompt
  }

  private onAbort = async () => {
    const chatState = this.getRepoChatState()
    if (chatState.sessionId) {
      await ipcRenderer.invoke('claude-abort', chatState.sessionId)
    }
    this.setRepoChatState({ ...chatState, isStreaming: false })
  }

  private onToggleCollapse = () => {
    this.setState(prev => ({ collapsed: !prev.collapsed }))
  }

  // Resize handling (horizontal - left edge)
  private onResizeStart = (e: React.MouseEvent) => {
    if (this.state.collapsed) {
      return
    }
    e.preventDefault()
    this.isDragging = true
    this.startX = e.clientX
    this.startWidth = this.state.width
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) {
      return
    }

    // Dragging left edge: moving left increases width
    const delta = this.startX - e.clientX
    const newWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, this.startWidth + delta)
    )
    this.setState({ width: newWidth })
  }

  private onMouseUp = () => {
    this.isDragging = false
  }

  public render() {
    const { width, collapsed } = this.state
    const chatState = this.getRepoChatState()
    const { messages, isStreaming } = chatState

    const panelClass = collapsed
      ? 'claude-chat-panel collapsed'
      : 'claude-chat-panel'

    return (
      <div
        className={panelClass}
        style={collapsed ? undefined : { width, flexShrink: 0 }}
      >
        {!collapsed && (
          <div
            className="claude-chat-resize-handle"
            onMouseDown={this.onResizeStart}
          />
        )}
        <div className="claude-chat-header">
          <span className="claude-chat-title">Claude</span>
          <button
            className="claude-chat-collapse-btn"
            onClick={this.onToggleCollapse}
            title={collapsed ? 'Expand chat' : 'Collapse chat'}
          >
            {collapsed ? '\u25C0' : '\u25B6'}
          </button>
        </div>
        {!collapsed && (
          <>
            <div className="claude-chat-messages">
              {messages.length === 0 && (
                <div className="claude-chat-empty">
                  Ask Claude anything about your code.
                </div>
              )}
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  message={msg}
                  cwd={this.props.cwd}
                />
              ))}
              {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="claude-chat-thinking">Claude is thinking...</div>
              )}
              <div ref={this.messagesEndRef} />
            </div>
            <ChatInput
              isStreaming={isStreaming}
              onSend={this.onSend}
              onAbort={this.onAbort}
            />
          </>
        )}
      </div>
    )
  }
}

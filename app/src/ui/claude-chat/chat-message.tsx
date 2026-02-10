import * as React from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { CodeBlock } from './code-block'

export interface IChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly images?: string[]
}

interface IChatMessageProps {
  readonly message: IChatMessage
  readonly cwd: string
}

interface IParsedBlock {
  readonly type: 'text' | 'code'
  readonly content: string
  readonly language?: string
  readonly filePath?: string | null
}

/**
 * Extracts a file path from a code fence info string or first-line comment.
 * Supports patterns like:
 *   ```ts:src/file.ts
 *   // file: src/file.ts
 */
function extractFilePath(
  language: string,
  code: string
): string | null {
  // Check info string pattern: lang:path
  if (language.includes(':')) {
    const parts = language.split(':')
    if (parts.length >= 2) {
      return parts.slice(1).join(':')
    }
  }

  // Check first-line comment pattern: // file: path
  const firstLine = code.split('\n')[0]
  const match = firstLine.match(/^\/\/\s*file:\s*(.+)$/)
  if (match) {
    return match[1].trim()
  }

  return null
}

/**
 * Parse markdown content into blocks of text and code.
 */
function parseBlocks(content: string): IParsedBlock[] {
  const blocks: IParsedBlock[] = []
  const codeBlockRegex = /```(\S*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before this code block
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      })
    }

    const infoString = match[1]
    const code = match[2]
    const baseLang = infoString.includes(':')
      ? infoString.split(':')[0]
      : infoString
    const filePath = extractFilePath(infoString, code)

    blocks.push({
      type: 'code',
      content: code,
      language: baseLang,
      filePath,
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    blocks.push({
      type: 'text',
      content: content.slice(lastIndex),
    })
  }

  return blocks
}

/**
 * Render a single chat message (user or assistant).
 */
export class ChatMessage extends React.Component<IChatMessageProps> {
  private renderAssistantContent() {
    const { message, cwd } = this.props
    const blocks = parseBlocks(message.content)

    return blocks.map((block, i) => {
      if (block.type === 'code') {
        return (
          <CodeBlock
            key={i}
            code={block.content}
            language={block.language || ''}
            filePath={block.filePath || null}
            cwd={cwd}
          />
        )
      }

      // Render markdown text
      const html = DOMPurify.sanitize(
        marked.parse(block.content) as string
      )
      return (
        <div
          key={i}
          className="claude-chat-markdown"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    })
  }

  public render() {
    const { message } = this.props
    const isUser = message.role === 'user'

    return (
      <div
        className={`claude-chat-message ${isUser ? 'claude-chat-message-user' : 'claude-chat-message-assistant'}`}
      >
        <div className="claude-chat-message-label">
          {isUser ? 'You' : 'Claude'}
        </div>
        <div className="claude-chat-message-content">
          {isUser ? (
            <>
              {message.images && message.images.length > 0 && (
                <div className="claude-chat-user-images">
                  {message.images.map((imgPath, j) => (
                    <img
                      key={j}
                      src={`file://${imgPath}`}
                      className="claude-chat-user-image"
                      alt="Pasted image"
                    />
                  ))}
                </div>
              )}
              {message.content && (
                <div className="claude-chat-user-text">{message.content}</div>
              )}
            </>
          ) : (
            this.renderAssistantContent()
          )}
        </div>
      </div>
    )
  }
}

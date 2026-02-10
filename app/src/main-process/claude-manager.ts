import { WebContents } from 'electron'
import { spawn, ChildProcess } from 'child_process'

interface IClaudeSession {
  id: string
  process: ChildProcess | null
  webContents: WebContents
  cwd: string
  claudeSessionId: string | null
}

const sessions = new Map<string, IClaudeSession>()
let nextSessionId = 1

function getShellEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>

  const standardPaths = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/opt/homebrew/bin',
  ]

  const currentPath = env.PATH || ''
  const pathParts = currentPath.split(':')
  for (const p of standardPaths) {
    if (!pathParts.includes(p)) {
      pathParts.push(p)
    }
  }
  env.PATH = pathParts.join(':')

  return env
}

/**
 * Create a new Claude chat session. No process is spawned yet (lazy).
 */
export function createSession(cwd: string, webContents: WebContents): string {
  const id = `claude-${nextSessionId++}`

  const session: IClaudeSession = {
    id,
    process: null,
    webContents,
    cwd,
    claudeSessionId: null,
  }

  sessions.set(id, session)
  console.log(`[claude-manager] Session ${id} created, cwd=${cwd}`)
  return id
}

/**
 * Send a prompt to Claude CLI. Spawns a new `claude` process for each prompt.
 * Uses --resume for follow-up messages within a session.
 */
export function sendPrompt(
  id: string,
  prompt: string,
  systemPrompt?: string,
  imagePaths?: string[]
): void {
  const session = sessions.get(id)
  if (!session) {
    console.error('[claude-manager] sendPrompt: no session for', id)
    return
  }

  // Kill any existing process for this session
  if (session.process) {
    try {
      session.process.kill('SIGTERM')
    } catch {}
    session.process = null
  }

  const env = getShellEnv()
  const args = ['-p', '--output-format', 'stream-json']

  if (session.claudeSessionId) {
    args.push('--resume', session.claudeSessionId)
  }

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt)
  }

  if (imagePaths && imagePaths.length > 0) {
    for (const imgPath of imagePaths) {
      args.push('--image', imgPath)
    }
  }

  args.push(prompt)

  console.log(`[claude-manager] Spawning claude for session ${id}`)

  let proc: ChildProcess
  try {
    proc = spawn('claude', args, {
      cwd: session.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err: any) {
    if (!session.webContents.isDestroyed()) {
      session.webContents.send('claude-error', id, {
        type: 'spawn-error',
        message:
          err.code === 'ENOENT'
            ? 'Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code'
            : `Failed to start Claude CLI: ${err.message}`,
      })
    }
    return
  }

  session.process = proc

  let lineBuffer = ''

  proc.stdout?.on('data', (data: Buffer) => {
    if (session.webContents.isDestroyed()) {
      return
    }

    lineBuffer += data.toString()
    const lines = lineBuffer.split('\n')
    // Keep the last (potentially incomplete) line in the buffer
    lineBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      try {
        const event = JSON.parse(trimmed)

        // Extract session_id from result events for --resume
        if (event.type === 'result' && event.session_id) {
          session.claudeSessionId = event.session_id
        }

        session.webContents.send('claude-stream-event', id, event)
      } catch {
        // Not valid JSON, ignore partial lines
      }
    }
  })

  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString()
    console.error(`[claude-manager] ${id} stderr:`, text)
    if (!session.webContents.isDestroyed()) {
      session.webContents.send('claude-stderr', id, text)
    }
  })

  proc.on('error', (err: Error) => {
    console.error(`[claude-manager] ${id} process error:`, err)
    if (!session.webContents.isDestroyed()) {
      session.webContents.send('claude-error', id, {
        type: 'process-error',
        message:
          (err as any).code === 'ENOENT'
            ? 'Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code'
            : `Claude process error: ${err.message}`,
      })
    }
  })

  proc.on('exit', (code: number | null) => {
    console.log(`[claude-manager] ${id} process exited with code ${code}`)
    session.process = null

    // Process any remaining buffer
    if (lineBuffer.trim() && !session.webContents.isDestroyed()) {
      try {
        const event = JSON.parse(lineBuffer.trim())
        if (event.type === 'result' && event.session_id) {
          session.claudeSessionId = event.session_id
        }
        session.webContents.send('claude-stream-event', id, event)
      } catch {}
    }
    lineBuffer = ''

    if (!session.webContents.isDestroyed()) {
      session.webContents.send('claude-complete', id, code)
    }
  })
}

/**
 * Abort the current request by killing the child process.
 */
export function abortRequest(id: string): void {
  const session = sessions.get(id)
  if (!session || !session.process) {
    return
  }

  try {
    session.process.kill('SIGTERM')
  } catch {}
  session.process = null
}

/**
 * Destroy a session and kill its process.
 */
export function destroySession(id: string): void {
  const session = sessions.get(id)
  if (!session) {
    return
  }

  if (session.process) {
    try {
      session.process.kill('SIGTERM')
    } catch {}
  }

  sessions.delete(id)
}

/**
 * Destroy all sessions. Called on app quit.
 */
export function destroyAllSessions(): void {
  for (const session of sessions.values()) {
    if (session.process) {
      try {
        session.process.kill('SIGTERM')
      } catch {}
    }
  }
  sessions.clear()
}

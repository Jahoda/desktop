/**
 * Gait IPC channels (npm scripts, terminal, Claude chat). Merged into the
 * upstream channel types in `ipc-shared.ts`.
 */

/** Gait channels sent from main to renderer (or one-way renderer to main) */
export type GaitRequestChannels = {
  // NPM Script Runner channels
  'npm-script-output': (id: string, data: string) => void
  'npm-script-exit': (id: string, code: number | null) => void
  // Terminal channels
  'pty-output': (id: string, data: string) => void
  'pty-exit': (id: string) => void
  // Claude Chat channels
  'claude-stream-event': (id: string, event: any) => void
  'claude-complete': (id: string, code: number | null) => void
  'claude-error': (id: string, error: any) => void
}

/** Gait request/response channels invoked from the renderer */
export type GaitRequestResponseChannels = {
  // NPM Script Runner
  'npm-script-start': (
    repoPath: string,
    manager: string,
    scriptName: string
  ) => Promise<string>
  'npm-script-stop': (id: string) => Promise<boolean>
  'npm-scripts-list-running': () => Promise<
    ReadonlyArray<{ id: string; scriptName: string; repoPath: string }>
  >
  // Terminal
  'pty-create': (cwd: string) => Promise<string>
  'pty-write': (id: string, data: string) => Promise<void>
  'pty-resize': (id: string, cols: number, rows: number) => Promise<void>
  'pty-destroy': (id: string) => Promise<void>
  // Claude Chat
  'claude-create-session': (cwd: string) => Promise<string>
  'claude-send-prompt': (
    id: string,
    prompt: string,
    systemPrompt?: string,
    imagePaths?: string[]
  ) => Promise<void>
  'claude-abort': (id: string) => Promise<void>
  'claude-destroy-session': (id: string) => Promise<void>
  'claude-apply-code': (filePath: string, code: string) => Promise<boolean>
  'claude-save-image': (base64Data: string) => Promise<string>
}

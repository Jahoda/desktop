import { WebContents } from 'electron'

interface IPtyInstance {
  id: string
  pty: any
  webContents: WebContents
}

const terminals = new Map<string, IPtyInstance>()
let nextTerminalId = 1

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/**
 * Create a new terminal instance.
 * Uses node-pty if available, falls back to child_process.
 */
export function createTerminal(
  cwd: string,
  webContents: WebContents
): string {
  const id = `pty-${nextTerminalId++}`

  try {
    // Try to use node-pty
    const nodePty = require('node-pty')
    const shell = getDefaultShell()
    const ptyProcess = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env,
    })

    const instance: IPtyInstance = {
      id,
      pty: ptyProcess,
      webContents,
    }

    terminals.set(id, instance)

    ptyProcess.onData((data: string) => {
      if (!webContents.isDestroyed()) {
        webContents.send('pty-output', id, data)
      }
    })

    ptyProcess.onExit(() => {
      terminals.delete(id)
      if (!webContents.isDestroyed()) {
        webContents.send('pty-exit', id)
      }
    })
  } catch {
    // Fallback: use child_process with shell
    const { spawn } = require('child_process')
    const shell = getDefaultShell()
    const proc = spawn(shell, [], {
      cwd,
      env: process.env,
      shell: false,
    })

    const instance: IPtyInstance = {
      id,
      pty: proc,
      webContents,
    }

    terminals.set(id, instance)

    proc.stdout?.on('data', (data: Buffer) => {
      if (!webContents.isDestroyed()) {
        webContents.send('pty-output', id, data.toString())
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      if (!webContents.isDestroyed()) {
        webContents.send('pty-output', id, data.toString())
      }
    })

    proc.on('exit', () => {
      terminals.delete(id)
      if (!webContents.isDestroyed()) {
        webContents.send('pty-exit', id)
      }
    })
  }

  return id
}

/**
 * Write data to a terminal.
 */
export function writeToTerminal(id: string, data: string): void {
  const instance = terminals.get(id)
  if (!instance) {
    return
  }

  const { pty } = instance
  if (typeof pty.write === 'function') {
    pty.write(data)
  } else if (pty.stdin) {
    pty.stdin.write(data)
  }
}

/**
 * Resize a terminal.
 */
export function resizeTerminal(
  id: string,
  cols: number,
  rows: number
): void {
  const instance = terminals.get(id)
  if (!instance) {
    return
  }

  const { pty } = instance
  if (typeof pty.resize === 'function') {
    try {
      pty.resize(cols, rows)
    } catch {
      // resize not supported in fallback mode
    }
  }
}

/**
 * Destroy a terminal instance.
 */
export function destroyTerminal(id: string): void {
  const instance = terminals.get(id)
  if (!instance) {
    return
  }

  const { pty } = instance
  if (typeof pty.kill === 'function') {
    pty.kill()
  } else if (typeof pty.destroy === 'function') {
    pty.destroy()
  }

  terminals.delete(id)
}

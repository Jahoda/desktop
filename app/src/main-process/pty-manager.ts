import { WebContents, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface IPtyInstance {
  id: string
  pty: any
  webContents: WebContents
  mode: 'node-pty' | 'python-pty' | 'child_process'
}

const terminals = new Map<string, IPtyInstance>()
let nextTerminalId = 1

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }

  const shell = process.env.SHELL || '/bin/zsh'

  // Verify the shell exists
  try {
    fs.accessSync(shell, fs.constants.X_OK)
    return shell
  } catch {
    // Fallback to known shells
    for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        continue
      }
    }
  }
  return '/bin/sh'
}

function getShellEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>

  // Ensure PATH includes standard directories
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
 * Find the pty-helper.py script bundled with the app.
 */
function findPtyHelper(): string | null {
  const candidates = [
    path.join(app.getAppPath(), 'static', 'pty-helper.py'),
    path.join(app.getAppPath(), 'pty-helper.py'),
    path.join(__dirname, 'pty-helper.py'),
    path.join(__dirname, '..', 'static', 'pty-helper.py'),
    path.join(__dirname, '..', 'src', 'main-process', 'pty-helper.py'),
    path.join(app.getAppPath(), 'src', 'main-process', 'pty-helper.py'),
  ]

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.R_OK)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

/**
 * Find a working python3 binary.
 */
function findPython(): string | null {
  const candidates = [
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/Current/bin/python3',
  ]

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

/**
 * Create a new terminal instance.
 * Uses node-pty if available, falls back to python3 pty helper for real PTY emulation.
 */
export function createTerminal(
  cwd: string,
  webContents: WebContents
): string {
  const id = `pty-${nextTerminalId++}`
  const shell = getDefaultShell()
  const env = getShellEnv()

  console.log(`[pty-manager] Creating terminal ${id}, shell=${shell}, cwd=${cwd}`)

  try {
    // Try to use node-pty
    const nodePty = require('node-pty')

    const ptyProcess = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env,
    })

    const instance: IPtyInstance = {
      id,
      pty: ptyProcess,
      webContents,
      mode: 'node-pty',
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

    console.log(`[pty-manager] Terminal ${id} created with node-pty (pid=${ptyProcess.pid})`)
  } catch (err) {
    console.error('[pty-manager] node-pty failed:', err)

    const { spawn } = require('child_process')
    const python = findPython()
    const helperScript = findPtyHelper()

    if (python && helperScript && process.platform !== 'win32') {
      // Use Python pty helper for real PTY emulation
      console.log(`[pty-manager] Fallback: using python3 pty helper (${python}, ${helperScript})`)

      const proc = spawn(python, [helperScript, shell, cwd, '80', '24'], {
        env: { ...env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const instance: IPtyInstance = {
        id,
        pty: proc,
        webContents,
        mode: 'python-pty',
      }

      terminals.set(id, instance)

      proc.stdout?.on('data', (data: Buffer) => {
        if (!webContents.isDestroyed()) {
          webContents.send('pty-output', id, data.toString())
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        console.error(`[pty-manager] ${id} stderr:`, data.toString())
      })

      proc.on('exit', (code: number | null) => {
        console.log(`[pty-manager] Terminal ${id} python-pty exited with code ${code}`)
        terminals.delete(id)
        if (!webContents.isDestroyed()) {
          webContents.send('pty-exit', id)
        }
      })

      proc.on('error', (err: Error) => {
        console.error(`[pty-manager] Terminal ${id} python-pty error:`, err)
      })

      console.log(`[pty-manager] Terminal ${id} created with python-pty (pid=${proc.pid})`)
    } else {
      // Last resort: plain child_process (no echo, limited functionality)
      console.log(`[pty-manager] Fallback: using plain child_process (python=${python}, helper=${helperScript})`)

      const args = process.platform === 'win32' ? [] : ['-i', '-l']
      const proc = spawn(shell, args, {
        cwd,
        env: { ...env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const instance: IPtyInstance = {
        id,
        pty: proc,
        webContents,
        mode: 'child_process',
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

      console.log(`[pty-manager] Terminal ${id} created with child_process fallback (pid=${proc.pid})`)
    }
  }

  return id
}

/**
 * Write data to a terminal.
 */
export function writeToTerminal(id: string, data: string): void {
  const instance = terminals.get(id)
  if (!instance) {
    console.error('[pty-manager] writeToTerminal: no instance for', id)
    return
  }

  const { pty } = instance
  if (typeof pty.write === 'function') {
    pty.write(data)
  } else if (pty.stdin && typeof pty.stdin.write === 'function') {
    pty.stdin.write(data)
  } else {
    console.error('[pty-manager] writeToTerminal: no write method available for', id)
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

/**
 * Destroy all terminal instances. Called on app quit.
 */
export function destroyAllTerminals(): void {
  for (const instance of terminals.values()) {
    const { pty } = instance
    if (typeof pty.kill === 'function') {
      pty.kill()
    } else if (typeof pty.destroy === 'function') {
      pty.destroy()
    }
  }
  terminals.clear()
}

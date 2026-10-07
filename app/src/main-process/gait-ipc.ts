import { app } from 'electron'
import * as ipcMain from './ipc-main'

/**
 * Register the main process side of Gait features (npm script runner,
 * terminal and Claude chat) and clean them up when the app quits.
 */
export function registerGaitIpcHandlers() {
  app.on('will-quit', () => {
    const { stopAllScripts } = require('../lib/npm/script-runner')
    stopAllScripts()
    const { destroyAllTerminals } = require('./pty-manager')
    destroyAllTerminals()
    const { destroyAllSessions } = require('./claude-manager')
    destroyAllSessions()
  })

  // NPM Script Runner IPC handlers
  ipcMain.handle('npm-script-start', (event, repoPath, manager, scriptName) => {
    const { startScript } = require('../lib/npm/script-runner')
    const webContents = event.sender

    const id = startScript(
      repoPath,
      manager as any,
      scriptName,
      (scriptId: string, data: string) => {
        if (!webContents.isDestroyed()) {
          webContents.send('npm-script-output', scriptId, data)
        }
      },
      (scriptId: string, code: number | null) => {
        if (!webContents.isDestroyed()) {
          webContents.send('npm-script-exit', scriptId, code)
        }
      }
    )

    return id
  })

  ipcMain.handle('npm-script-stop', async (_, id) => {
    const { stopScript } = require('../lib/npm/script-runner')
    return stopScript(id)
  })

  ipcMain.handle('npm-scripts-list-running', async () => {
    const { getRunningScripts } = require('../lib/npm/script-runner')
    return getRunningScripts()
  })

  // Terminal (PTY) IPC handlers
  ipcMain.handle('pty-create', (event, cwd) => {
    const { createTerminal } = require('./pty-manager')
    const webContents = event.sender

    return createTerminal(cwd, webContents)
  })

  ipcMain.handle('pty-write', async (_, id, data) => {
    const { writeToTerminal } = require('./pty-manager')
    writeToTerminal(id, data)
  })

  ipcMain.handle('pty-resize', async (_, id, cols, rows) => {
    const { resizeTerminal } = require('./pty-manager')
    resizeTerminal(id, cols, rows)
  })

  ipcMain.handle('pty-destroy', async (_, id) => {
    const { destroyTerminal } = require('./pty-manager')
    destroyTerminal(id)
  })

  // Claude Chat IPC handlers
  ipcMain.handle('claude-create-session', (event, cwd) => {
    const { createSession } = require('./claude-manager')
    return createSession(cwd, event.sender)
  })

  ipcMain.handle(
    'claude-send-prompt',
    async (_, id, prompt, systemPrompt, imagePaths) => {
      const { sendPrompt } = require('./claude-manager')
      sendPrompt(id, prompt, systemPrompt, imagePaths)
    }
  )

  ipcMain.handle('claude-abort', async (_, id) => {
    const { abortRequest } = require('./claude-manager')
    abortRequest(id)
  })

  ipcMain.handle('claude-destroy-session', async (_, id) => {
    const { destroySession } = require('./claude-manager')
    destroySession(id)
  })

  ipcMain.handle('claude-apply-code', async (_, filePath, code) => {
    const fs = require('fs')
    const path = require('path')
    // Ensure parent directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, code, 'utf-8')
    return true
  })

  ipcMain.handle('claude-save-image', async (_, base64Data: string) => {
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const tmpDir = path.join(os.tmpdir(), 'gait-claude-images')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    const fileName = `paste-${Date.now()}.png`
    const filePath = path.join(tmpDir, fileName)
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
    return filePath
  })
}

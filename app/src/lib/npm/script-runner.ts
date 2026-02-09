import { ChildProcess, spawn } from 'child_process'
import { PackageManager, getRunCommand } from './script-detector'

export interface IRunningScript {
  readonly id: string
  readonly scriptName: string
  readonly manager: PackageManager
  readonly repoPath: string
  readonly process: ChildProcess
  readonly startedAt: Date
}

export type ScriptOutputCallback = (id: string, data: string) => void
export type ScriptExitCallback = (id: string, code: number | null) => void

let nextScriptId = 1
const runningScripts = new Map<string, IRunningScript>()

/**
 * Start a script in the given repository path.
 * Returns the script ID for tracking.
 */
export function startScript(
  repoPath: string,
  manager: PackageManager,
  scriptName: string,
  onOutput: ScriptOutputCallback,
  onExit: ScriptExitCallback
): string {
  const id = `script-${nextScriptId++}`
  const [cmd, ...args] = getRunCommand(manager, scriptName)

  const proc = spawn(cmd, args, {
    cwd: repoPath,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  })

  const script: IRunningScript = {
    id,
    scriptName,
    manager,
    repoPath,
    process: proc,
    startedAt: new Date(),
  }

  runningScripts.set(id, script)

  proc.stdout?.on('data', (data: Buffer) => {
    onOutput(id, data.toString())
  })

  proc.stderr?.on('data', (data: Buffer) => {
    onOutput(id, data.toString())
  })

  proc.on('exit', (code: number | null) => {
    runningScripts.delete(id)
    onExit(id, code)
  })

  proc.on('error', (err: Error) => {
    onOutput(id, `Error: ${err.message}\n`)
    runningScripts.delete(id)
    onExit(id, 1)
  })

  return id
}

/**
 * Stop a running script by ID.
 */
export function stopScript(id: string): boolean {
  const script = runningScripts.get(id)
  if (!script) {
    return false
  }

  script.process.kill('SIGTERM')

  // Force kill after 5 seconds if still running
  setTimeout(() => {
    if (runningScripts.has(id)) {
      script.process.kill('SIGKILL')
      runningScripts.delete(id)
    }
  }, 5000)

  return true
}

/**
 * Get all currently running scripts.
 */
export function getRunningScripts(): ReadonlyArray<{
  id: string
  scriptName: string
  repoPath: string
}> {
  return Array.from(runningScripts.values()).map(s => ({
    id: s.id,
    scriptName: s.scriptName,
    repoPath: s.repoPath,
  }))
}

/**
 * Stop all running scripts. Called on app quit / window close.
 */
export function stopAllScripts(): void {
  for (const script of runningScripts.values()) {
    script.process.kill('SIGTERM')
  }
  // Force kill any remaining after 3 seconds
  setTimeout(() => {
    for (const script of runningScripts.values()) {
      script.process.kill('SIGKILL')
    }
    runningScripts.clear()
  }, 3000)
}

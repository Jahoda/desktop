import * as Path from 'path'
import { readFile, access } from 'fs/promises'

export type PackageManager = 'npm' | 'yarn' | 'pnpm'

export interface INpmScripts {
  readonly manager: PackageManager
  readonly scripts: Record<string, string>
}

/**
 * Detect which package manager is used in the repository by looking
 * at lockfiles.
 */
async function detectPackageManager(
  repoPath: string
): Promise<PackageManager> {
  const lockfiles: Array<{ file: string; manager: PackageManager }> = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' },
  ]

  for (const { file, manager } of lockfiles) {
    try {
      await access(Path.join(repoPath, file))
      return manager
    } catch {
      // continue
    }
  }

  return 'npm'
}

/**
 * Read package.json and detect the package manager for the given
 * repository path.
 *
 * Returns null if no package.json is found.
 */
export async function detectNpmScripts(
  repoPath: string
): Promise<INpmScripts | null> {
  const packageJsonPath = Path.join(repoPath, 'package.json')

  try {
    const content = await readFile(packageJsonPath, 'utf8')
    const pkg = JSON.parse(content)
    const scripts: Record<string, string> = pkg.scripts || {}

    if (Object.keys(scripts).length === 0) {
      return null
    }

    const manager = await detectPackageManager(repoPath)

    return { manager, scripts }
  } catch {
    return null
  }
}

/**
 * Get the run command for a given package manager and script name.
 */
export function getRunCommand(
  manager: PackageManager,
  scriptName: string
): string[] {
  switch (manager) {
    case 'npm':
      return ['npm', 'run', scriptName]
    case 'yarn':
      return ['yarn', scriptName]
    case 'pnpm':
      return ['pnpm', 'run', scriptName]
  }
}

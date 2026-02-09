import * as Path from 'path'
import { readFile, access, readdir, stat } from 'fs/promises'

export type PackageManager = 'npm' | 'yarn' | 'pnpm'

export interface INpmScripts {
  readonly manager: PackageManager
  readonly scripts: Record<string, string>
}

/** A single workspace package with its scripts. */
export interface IWorkspacePackage {
  /** Display name (package name from package.json, or relative path) */
  readonly name: string
  /** Absolute path to the package directory */
  readonly path: string
  /** Scripts from package.json */
  readonly scripts: Record<string, string>
}

/** Result of detecting npm scripts, including monorepo workspace support. */
export interface IMonorepoScripts {
  readonly manager: PackageManager
  /** Root package scripts (may be empty) */
  readonly rootScripts: Record<string, string>
  /** Workspace packages with their scripts */
  readonly workspaces: ReadonlyArray<IWorkspacePackage>
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
 * Resolve workspace glob patterns to actual directories.
 * Supports simple patterns like "packages/*" and "apps/*".
 */
async function resolveWorkspacePatterns(
  repoPath: string,
  patterns: string[]
): Promise<string[]> {
  const dirs: string[] = []

  for (const pattern of patterns) {
    // Skip negation patterns
    if (pattern.startsWith('!')) {
      continue
    }

    // Simple glob: "packages/*" or "apps/*" → scan parent dir
    if (pattern.endsWith('/*') || pattern.endsWith('\\*')) {
      const parentDir = pattern.slice(0, -2)
      const parentPath = Path.join(repoPath, parentDir)

      try {
        const entries = await readdir(parentPath)
        for (const entry of entries) {
          const entryPath = Path.join(parentPath, entry)
          try {
            const entryStat = await stat(entryPath)
            if (entryStat.isDirectory()) {
              const pkgJson = Path.join(entryPath, 'package.json')
              try {
                await access(pkgJson)
                dirs.push(entryPath)
              } catch {
                // No package.json, skip
              }
            }
          } catch {
            // Skip
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    } else if (pattern.endsWith('/**')) {
      // Recursive glob: "packages/**" → scan recursively
      const parentDir = pattern.slice(0, -3)
      const parentPath = Path.join(repoPath, parentDir)
      await scanForPackages(parentPath, dirs, 3)
    } else {
      // Direct path reference: "tools/eslint-config"
      const dirPath = Path.join(repoPath, pattern)
      try {
        const pkgJson = Path.join(dirPath, 'package.json')
        await access(pkgJson)
        dirs.push(dirPath)
      } catch {
        // Skip
      }
    }
  }

  return dirs
}

/**
 * Recursively scan for directories with package.json.
 */
async function scanForPackages(
  dir: string,
  results: string[],
  maxDepth: number
): Promise<void> {
  if (maxDepth <= 0) {
    return
  }

  try {
    const entries = await readdir(dir)
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) {
        continue
      }

      const entryPath = Path.join(dir, entry)
      try {
        const entryStat = await stat(entryPath)
        if (entryStat.isDirectory()) {
          const pkgJson = Path.join(entryPath, 'package.json')
          try {
            await access(pkgJson)
            results.push(entryPath)
          } catch {
            // No package.json, scan deeper
            await scanForPackages(entryPath, results, maxDepth - 1)
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Directory doesn't exist
  }
}

/**
 * Read workspace patterns from root package.json for different package managers.
 */
async function getWorkspacePatterns(
  repoPath: string,
  manager: PackageManager
): Promise<string[]> {
  // Check pnpm-workspace.yaml for pnpm
  if (manager === 'pnpm') {
    try {
      const yamlPath = Path.join(repoPath, 'pnpm-workspace.yaml')
      const yamlContent = await readFile(yamlPath, 'utf8')
      // Simple YAML parsing for packages list
      const patterns: string[] = []
      let inPackages = false
      for (const line of yamlContent.split('\n')) {
        const trimmed = line.trim()
        if (trimmed === 'packages:') {
          inPackages = true
          continue
        }
        if (inPackages) {
          if (trimmed.startsWith('-')) {
            const value = trimmed
              .slice(1)
              .trim()
              .replace(/^['"]|['"]$/g, '')
            if (value) {
              patterns.push(value)
            }
          } else if (trimmed && !trimmed.startsWith('#')) {
            break
          }
        }
      }
      if (patterns.length > 0) {
        return patterns
      }
    } catch {
      // Fall through to package.json check
    }
  }

  // Check package.json workspaces field (npm, yarn)
  try {
    const content = await readFile(
      Path.join(repoPath, 'package.json'),
      'utf8'
    )
    const pkg = JSON.parse(content)
    const workspaces = pkg.workspaces

    if (Array.isArray(workspaces)) {
      return workspaces
    }

    // Yarn supports { packages: [...] } format
    if (workspaces && Array.isArray(workspaces.packages)) {
      return workspaces.packages
    }
  } catch {
    // No package.json
  }

  return []
}

/**
 * Detect npm scripts in a monorepo, including all workspace packages.
 *
 * Returns null if no package.json is found at all.
 */
export async function detectMonorepoScripts(
  repoPath: string
): Promise<IMonorepoScripts | null> {
  const manager = await detectPackageManager(repoPath)

  // Read root package.json
  let rootScripts: Record<string, string> = {}
  try {
    const content = await readFile(
      Path.join(repoPath, 'package.json'),
      'utf8'
    )
    const pkg = JSON.parse(content)
    rootScripts = pkg.scripts || {}
  } catch {
    return null
  }

  // Detect workspace patterns
  const patterns = await getWorkspacePatterns(repoPath, manager)
  const workspaces: IWorkspacePackage[] = []

  if (patterns.length > 0) {
    const workspaceDirs = await resolveWorkspacePatterns(repoPath, patterns)

    for (const dir of workspaceDirs) {
      try {
        const content = await readFile(
          Path.join(dir, 'package.json'),
          'utf8'
        )
        const pkg = JSON.parse(content)
        const scripts: Record<string, string> = pkg.scripts || {}

        if (Object.keys(scripts).length > 0) {
          const name =
            pkg.name || Path.relative(repoPath, dir).replace(/\\/g, '/')
          workspaces.push({ name, path: dir, scripts })
        }
      } catch {
        // Skip unreadable packages
      }
    }
  }

  // If no workspaces found and no root scripts, return null
  if (
    Object.keys(rootScripts).length === 0 &&
    workspaces.length === 0
  ) {
    return null
  }

  return { manager, rootScripts, workspaces }
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

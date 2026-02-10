import * as fs from 'fs'
import * as path from 'path'
import * as keytar from 'keytar'
import { getDotComAPIEndpoint } from '../api'

/** Account info extracted from GitHub Desktop */
export interface IGHDAccount {
  readonly login: string
  readonly endpoint: string
  readonly emails: ReadonlyArray<string>
  readonly avatarURL: string
  readonly id: number
  readonly name: string
  /** Token retrieved from keychain (may be empty if not found) */
  readonly token: string
}

/** Preferences extracted from GitHub Desktop */
export interface IGHDPreferences {
  readonly externalEditor?: string
  readonly shell?: string
  readonly theme?: string
  readonly confirmDiscardChanges?: string
  readonly confirmForcePush?: string
  readonly hideWhitespaceInDiff?: string
  readonly sidebarWidth?: string
}

/** Full import data from GitHub Desktop */
export interface IGitHubDesktopImportData {
  readonly accounts: ReadonlyArray<IGHDAccount>
  readonly repositories: ReadonlyArray<string>
  readonly preferences: IGHDPreferences
}

/**
 * Get the GitHub Desktop data directory path for the current platform.
 */
function getGitHubDesktopDataPath(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || ''

  if (process.platform === 'darwin') {
    const p = path.join(home, 'Library', 'Application Support', 'GitHub Desktop')
    return fs.existsSync(p) ? p : null
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    const p = path.join(appData, 'GitHub Desktop')
    return fs.existsSync(p) ? p : null
  }

  // Linux
  const p = path.join(home, '.config', 'GitHub Desktop')
  return fs.existsSync(p) ? p : null
}

/**
 * Extract printable ASCII/UTF-8 strings from a binary buffer.
 * Similar to the Unix `strings` command.
 */
function extractStrings(buf: Buffer, minLength = 4): string[] {
  const results: string[] = []
  let current = ''

  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]
    // Printable ASCII range (space through ~)
    if (byte >= 0x20 && byte <= 0x7e) {
      current += String.fromCharCode(byte)
    } else {
      if (current.length >= minLength) {
        results.push(current)
      }
      current = ''
    }
  }

  if (current.length >= minLength) {
    results.push(current)
  }

  return results
}

/**
 * Read all .ldb files from a LevelDB directory and extract strings.
 */
function extractStringsFromLevelDB(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const allStrings: string[] = []
  const files = fs.readdirSync(dirPath)

  for (const file of files) {
    if (file.endsWith('.ldb') || file.endsWith('.log')) {
      try {
        const buf = fs.readFileSync(path.join(dirPath, file))
        allStrings.push(...extractStrings(buf))
      } catch {
        // Skip unreadable files
      }
    }
  }

  return allStrings
}

/**
 * Extract repository paths from IndexedDB LevelDB data.
 */
function readRepositories(dataPath: string): string[] {
  const idbPath = path.join(
    dataPath,
    'IndexedDB',
    'file__0.indexeddb.leveldb'
  )
  const strings = extractStringsFromLevelDB(idbPath)

  // On macOS paths start with /Users/ or /Volumes/
  // On Windows paths start with C:\ or similar drive letter
  // On Linux paths start with /home/
  const pathPatterns = [
    /^\/Users\/[^\s]+$/,
    /^\/home\/[^\s]+$/,
    /^\/Volumes\/[^\s]+$/,
    /^[A-Z]:\\[^\s]+$/,
  ]

  const seen = new Set<string>()
  const repositories: string[] = []

  for (const s of strings) {
    // Skip strings that are too short or too long for paths
    if (s.length < 5 || s.length > 500) {
      continue
    }

    // Check if it matches a path pattern
    const isPath = pathPatterns.some(p => p.test(s))
    if (!isPath) {
      continue
    }

    // Normalize: remove trailing slashes
    const normalized = s.replace(/[/\\]+$/, '')

    if (seen.has(normalized)) {
      continue
    }
    seen.add(normalized)

    // Verify the path exists and is a git repo
    try {
      const gitDir = path.join(normalized, '.git')
      if (fs.existsSync(normalized) && fs.existsSync(gitDir)) {
        repositories.push(normalized)
      }
    } catch {
      // Skip invalid paths
    }
  }

  return repositories.sort()
}

/**
 * Extract user account data from Local Storage LevelDB.
 */
function readAccountsFromLocalStorage(
  dataPath: string
): Array<{
  login: string
  endpoint: string
  emails: string[]
  avatarURL: string
  id: number
  name: string
}> {
  const lsPath = path.join(dataPath, 'Local Storage', 'leveldb')
  const strings = extractStringsFromLevelDB(lsPath)

  // Look for the "users" key value - it's a JSON array
  // The data in Local Storage is stored after a \x00\x01 prefix key
  // We need to find a JSON array that looks like user account data
  for (const s of strings) {
    if (!s.includes('"login"') || !s.includes('"endpoint"')) {
      continue
    }

    // Try to extract JSON from the string
    const jsonStart = s.indexOf('[')
    const jsonEnd = s.lastIndexOf(']')
    if (jsonStart === -1 || jsonEnd === -1) {
      continue
    }

    try {
      const json = s.substring(jsonStart, jsonEnd + 1)
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) {
        continue
      }

      return parsed
        .filter(
          (u: any) =>
            typeof u.login === 'string' && typeof u.endpoint === 'string'
        )
        .map((u: any) => ({
          login: u.login as string,
          endpoint: u.endpoint as string,
          emails: Array.isArray(u.emails)
            ? u.emails
                .filter((e: any) => typeof e.email === 'string')
                .map((e: any) => e.email as string)
            : [],
          avatarURL: (u.avatarURL as string) || '',
          id: (u.id as number) || 0,
          name: (u.name as string) || '',
        }))
    } catch {
      continue
    }
  }

  return []
}

/**
 * Read preferences from Local Storage LevelDB.
 */
function readPreferences(dataPath: string): IGHDPreferences {
  const lsPath = path.join(dataPath, 'Local Storage', 'leveldb')
  const strings = extractStringsFromLevelDB(lsPath)

  const prefs: Record<string, string> = {}

  // Known preference keys to look for
  const knownKeys = [
    'externalEditor',
    'shell',
    'theme',
    'confirmDiscardChanges',
    'confirmForcePush',
    'hide-whitespace-in-diff',
    'sidebar-width',
  ]

  // In Chromium Local Storage, keys and values appear as consecutive strings
  // after the \x00\x01 prefix. We look for known key names and take the
  // next meaningful string as the value.
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]
    for (const key of knownKeys) {
      // The key might appear as part of a longer string with prefix
      if (s === key || s.endsWith(key)) {
        // The value is typically in the next few strings
        for (let j = i + 1; j < Math.min(i + 5, strings.length); j++) {
          const candidate = strings[j]
          // Skip strings that look like other keys or are too long
          if (
            candidate.length > 0 &&
            candidate.length < 200 &&
            !knownKeys.includes(candidate)
          ) {
            prefs[key] = candidate
            break
          }
        }
      }
    }
  }

  return {
    externalEditor: prefs['externalEditor'],
    shell: prefs['shell'],
    theme: prefs['theme'],
    confirmDiscardChanges: prefs['confirmDiscardChanges'],
    confirmForcePush: prefs['confirmForcePush'],
    hideWhitespaceInDiff: prefs['hide-whitespace-in-diff'],
    sidebarWidth: prefs['sidebar-width'],
  }
}

/**
 * Get tokens from macOS Keychain for GitHub Desktop accounts.
 * GitHub Desktop uses service name "GitHub Desktop - <endpoint>".
 */
async function getTokensFromKeychain(): Promise<
  Map<string, { login: string; token: string }>
> {
  const tokens = new Map<string, { login: string; token: string }>()

  const endpoints = [getDotComAPIEndpoint()]

  for (const endpoint of endpoints) {
    const serviceName = `GitHub Desktop - ${endpoint}`
    try {
      const credentials = await keytar.findCredentials(serviceName)
      for (const cred of credentials) {
        tokens.set(endpoint, {
          login: cred.account,
          token: cred.password,
        })
      }
    } catch {
      // Keychain access denied or service not found
    }
  }

  return tokens
}

/**
 * Check if GitHub Desktop is installed (data directory exists).
 */
export function isGitHubDesktopInstalled(): boolean {
  return getGitHubDesktopDataPath() !== null
}

/**
 * Scan GitHub Desktop data and return all importable data.
 */
export async function scanGitHubDesktop(): Promise<IGitHubDesktopImportData | null> {
  const dataPath = getGitHubDesktopDataPath()
  if (!dataPath) {
    return null
  }

  // Read repositories from IndexedDB
  const repositories = readRepositories(dataPath)

  // Read account info from Local Storage
  const rawAccounts = readAccountsFromLocalStorage(dataPath)

  // Get tokens from keychain
  const keychainTokens = await getTokensFromKeychain()

  // Merge account info with tokens
  const accounts: IGHDAccount[] = rawAccounts.map(a => {
    const keychainEntry = keychainTokens.get(a.endpoint)
    const token =
      keychainEntry && keychainEntry.login === a.login
        ? keychainEntry.token
        : ''

    return {
      login: a.login,
      endpoint: a.endpoint,
      emails: a.emails,
      avatarURL: a.avatarURL,
      id: a.id,
      name: a.name,
      token,
    }
  })

  // Also add accounts found only in keychain (not in Local Storage)
  for (const [endpoint, cred] of keychainTokens) {
    if (!accounts.some(a => a.endpoint === endpoint && a.login === cred.login)) {
      accounts.push({
        login: cred.login,
        endpoint,
        emails: [],
        avatarURL: '',
        id: 0,
        name: '',
        token: cred.token,
      })
    }
  }

  // Read preferences
  const preferences = readPreferences(dataPath)

  return { accounts, repositories, preferences }
}

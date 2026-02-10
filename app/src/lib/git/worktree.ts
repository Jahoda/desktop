import * as Path from 'path'
import { git } from './core'
import { Repository } from '../../models/repository'

export interface IWorktreeEntry {
  readonly path: string
  readonly head: string
  readonly branch: string | null
  readonly bare: boolean
}

/**
 * List all worktrees for the given repository.
 */
export async function listWorktrees(
  repository: Repository
): Promise<ReadonlyArray<IWorktreeEntry>> {
  const result = await git(
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'listWorktrees'
  )

  const entries: IWorktreeEntry[] = []
  let curPath = ''
  let curHead = ''
  let curBranch: string | null = null
  let curBare = false

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      curPath = line.slice('worktree '.length)
    } else if (line.startsWith('HEAD ')) {
      curHead = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      curBranch = line.slice('branch '.length)
    } else if (line === 'bare') {
      curBare = true
    } else if (line.trim() === '' && curPath) {
      entries.push({
        path: curPath,
        head: curHead,
        branch: curBranch,
        bare: curBare,
      })
      curPath = ''
      curHead = ''
      curBranch = null
      curBare = false
    }
  }

  // Handle last entry if no trailing newline
  if (curPath) {
    entries.push({
      path: curPath,
      head: curHead,
      branch: curBranch,
      bare: curBare,
    })
  }

  return entries
}

/**
 * Create a new worktree for the given branch.
 * Returns the absolute path of the new worktree.
 *
 * The worktree is placed in a sibling directory named
 * `<repo-basename>--<branch>`.
 */
export async function addWorktree(
  repository: Repository,
  branch: string
): Promise<string> {
  const repoBaseName = Path.basename(repository.path)
  // Sanitize branch name for filesystem (e.g. feature/foo → feature-foo)
  const safeBranch = branch.replace(/[/\\:*?"<>|]/g, '-')
  const worktreePath = Path.resolve(
    repository.path,
    '..',
    `${repoBaseName}--${safeBranch}`
  )

  await git(
    ['worktree', 'add', worktreePath, branch],
    repository.path,
    'addWorktree'
  )

  return worktreePath
}

/**
 * Remove a linked worktree.
 */
export async function removeWorktree(
  repository: Repository,
  worktreePath: string
): Promise<void> {
  await git(
    ['worktree', 'remove', worktreePath],
    repository.path,
    'removeWorktree'
  )
}

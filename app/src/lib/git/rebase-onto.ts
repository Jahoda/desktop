import { Repository } from '../../models/repository'
import { git } from './core'
import { getStatus } from './status'
import { Branch } from '../../models/branch'
import { RebaseResult } from './rebase'

export interface IRebaseOntoResult {
  readonly result: RebaseResult
  readonly commitCount: number
  readonly targetBranch: string
}

/**
 * Find the default branch (main or master) for a repository by checking
 * which branches exist locally.
 */
export async function findDefaultBranch(
  repository: Repository,
  allBranches: ReadonlyArray<Branch>
): Promise<Branch | null> {
  // Prioritize: main, master, then any branch matching the GitHub default
  const defaultNames = ['main', 'master']

  for (const name of defaultNames) {
    const branch = allBranches.find(
      b => b.name === name || b.name === `origin/${name}`
    )
    if (branch) {
      return branch
    }
  }

  return null
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
export async function isWorkingTreeClean(
  repository: Repository
): Promise<boolean> {
  const status = await getStatus(repository)
  if (status === null) {
    return false
  }
  return status.workingDirectory.files.length === 0
}

/**
 * Count the number of commits on the current branch that are not on the target branch.
 */
export async function countCommitsOnBranch(
  repository: Repository,
  targetBranch: string
): Promise<number> {
  const result = await git(
    ['rev-list', '--count', `${targetBranch}..HEAD`],
    repository.path,
    'countCommitsOnBranch',
    { successExitCodes: new Set([0]) }
  )

  return parseInt(result.stdout.trim(), 10) || 0
}

/**
 * Perform a rebase --onto of the current branch onto the default branch.
 *
 * This effectively rebases all commits unique to the current branch
 * onto the tip of the default branch.
 */
export async function rebaseOntoDefaultBranch(
  repository: Repository,
  defaultBranch: Branch
): Promise<IRebaseOntoResult> {
  const targetBranch = defaultBranch.name

  // Count commits on the current branch that are not on the default branch
  const commitCount = await countCommitsOnBranch(repository, targetBranch)

  if (commitCount === 0) {
    return {
      result: RebaseResult.AlreadyUpToDate,
      commitCount: 0,
      targetBranch,
    }
  }

  try {
    // First, fetch the latest state of the default branch
    await git(
      ['fetch', 'origin', targetBranch],
      repository.path,
      'fetchDefaultBranch',
      {
        successExitCodes: new Set([0]),
        expectedErrors: new Set(),
      }
    )
  } catch {
    // Fetch may fail if offline, continue with local state
  }

  try {
    const result = await git(
      ['rebase', '--onto', targetBranch, `HEAD~${commitCount}`],
      repository.path,
      'rebaseOnto',
      {
        successExitCodes: new Set([0]),
        expectedErrors: new Set(),
      }
    )

    if (result.exitCode === 0) {
      return {
        result: RebaseResult.CompletedWithoutError,
        commitCount,
        targetBranch,
      }
    }

    return {
      result: RebaseResult.Error,
      commitCount,
      targetBranch,
    }
  } catch (err) {
    // Check if this is a conflict
    const status = await getStatus(repository)
    if (status !== null) {
      const hasConflicts = status.workingDirectory.files.some(
        f => f.status.kind === 'conflicted'
      )
      if (hasConflicts) {
        return {
          result: RebaseResult.ConflictsEncountered,
          commitCount,
          targetBranch,
        }
      }
    }

    return {
      result: RebaseResult.Error,
      commitCount,
      targetBranch,
    }
  }
}

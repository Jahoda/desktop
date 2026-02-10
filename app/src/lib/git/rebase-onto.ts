import { Repository } from '../../models/repository'
import { git } from './core'
import { getStatus } from './status'
import { Branch } from '../../models/branch'
import { RebaseResult } from './rebase'
import { AppFileStatusKind } from '../../models/status'

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
 * This fetches the latest state from origin, then rebases all commits
 * unique to the current branch onto origin/{defaultBranch} using
 * `git rebase --onto` with the merge-base for minimal conflicts.
 */
export async function rebaseOntoDefaultBranch(
  repository: Repository,
  defaultBranch: Branch
): Promise<IRebaseOntoResult> {
  // Resolve the bare branch name (strip origin/ prefix if present)
  const bareName = defaultBranch.name.startsWith('origin/')
    ? defaultBranch.name.replace('origin/', '')
    : defaultBranch.name
  const remoteRef = `origin/${bareName}`

  try {
    // Fetch the latest state of the default branch from origin
    await git(
      ['fetch', 'origin', bareName],
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

  // Use merge-base to find the fork point between current branch and the
  // remote default branch — this is more robust than HEAD~N when the
  // branch has been partially rebased before.
  let mergeBase: string | null = null
  try {
    const mbResult = await git(
      ['merge-base', remoteRef, 'HEAD'],
      repository.path,
      'mergeBase',
      { successExitCodes: new Set([0]) }
    )
    mergeBase = mbResult.stdout.trim()
  } catch {
    // fall through
  }

  // Count commits that will be rebased
  const commitCount = await countCommitsOnBranch(repository, remoteRef)

  if (commitCount === 0) {
    return {
      result: RebaseResult.AlreadyUpToDate,
      commitCount: 0,
      targetBranch: remoteRef,
    }
  }

  // Use merge-base as the upstream reference for --onto when available,
  // falling back to HEAD~N
  const upstreamRef = mergeBase ?? `HEAD~${commitCount}`

  try {
    const result = await git(
      ['rebase', '--onto', remoteRef, upstreamRef],
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
        targetBranch: remoteRef,
      }
    }

    return {
      result: RebaseResult.Error,
      commitCount,
      targetBranch: remoteRef,
    }
  } catch (err) {
    // Check if this is a conflict
    const status = await getStatus(repository)
    if (status !== null) {
      const hasConflicts = status.workingDirectory.files.some(
        f => f.status.kind === AppFileStatusKind.Conflicted
      )
      if (hasConflicts) {
        return {
          result: RebaseResult.ConflictsEncountered,
          commitCount,
          targetBranch: remoteRef,
        }
      }
    }

    return {
      result: RebaseResult.Error,
      commitCount,
      targetBranch: remoteRef,
    }
  }
}

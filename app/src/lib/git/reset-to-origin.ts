import { Repository } from '../../models/repository'
import { git } from './core'
import { envForRemoteOperation } from './environment'

/**
 * Fetch from origin and reset the current branch to match origin.
 *
 * Equivalent to `git fetch origin && git reset --hard origin/{branchName}`.
 *
 * WARNING: This is a destructive operation that discards all local changes
 * and commits that are not on the remote.
 */
export async function resetToOrigin(
  repository: Repository,
  branchName: string,
  remoteUrl: string
): Promise<void> {
  // First fetch the latest from origin
  await git(
    ['fetch', 'origin', branchName],
    repository.path,
    'fetchBeforeReset',
    {
      successExitCodes: new Set([0]),
      env: await envForRemoteOperation(remoteUrl),
    }
  )

  // Then reset to origin
  await git(
    ['reset', '--hard', `origin/${branchName}`],
    repository.path,
    'resetToOrigin',
    {
      successExitCodes: new Set([0]),
    }
  )
}

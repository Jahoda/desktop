import { git, gitRebaseArguments, IGitStringExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { IPullProgress } from '../../models/progress'
import { PullProgressParser, executionOptionsWithProgress } from '../progress'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'

/**
 * Pull with rebase from the specified remote.
 *
 * Equivalent to `git pull --rebase origin`.
 */
export async function pullRebase(
  repository: Repository,
  remote: IRemote,
  options?: {
    progressCallback?: (progress: IPullProgress) => void
  }
): Promise<void> {
  let opts: IGitStringExecutionOptions = {
    env: await envForRemoteOperation(remote.url),
    interceptHooks: ['pre-rebase', 'pre-commit', 'post-rewrite'],
  }

  if (options?.progressCallback) {
    const title = `Pulling ${remote.name} (rebase)`
    const kind = 'pull'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new PullProgressParser(),
      progress => {
        if (progress.kind === 'context') {
          if (!progress.text.startsWith('remote: Counting objects')) {
            return
          }
        }

        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text

        const value = progress.percent

        options?.progressCallback?.({
          kind,
          title,
          description,
          value,
          remote: remote.name,
        })
      }
    )

    options.progressCallback({ kind, title, value: 0, remote: remote.name })
  }

  const args = [
    ...gitRebaseArguments(),
    'pull',
    '--rebase',
    '--recurse-submodules',
    ...(options?.progressCallback ? ['--progress'] : []),
    remote.name,
  ]

  await git(args, repository.path, 'pullRebase', opts)
}

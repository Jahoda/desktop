import * as Path from 'path'
import { Account } from '../../models/account'
import { Progress } from '../../models/progress'
import { Repository } from '../../models/repository'
import { RetryActionType } from '../../models/retry-actions'
import { TipState } from '../../models/tip'
import { IRepositoryState } from '../app-state'
import { IGaitState, ITabState } from '../gait/gait-state'
import { pullRebase } from '../git/pull-rebase'
import {
  findDefaultBranch,
  isWorkingTreeClean,
  rebaseOntoDefaultBranch,
  IRebaseOntoResult,
} from '../git/rebase-onto'
import { resetToOrigin } from '../git/reset-to-origin'
import { addWorktree } from '../git/worktree'
import { IGHDAccount, IGHDPreferences } from '../import/github-desktop-importer'
import {
  getNumber,
  getNumberArray,
  setNumber,
  setNumberArray,
} from '../local-storage'
import { GitStore } from './git-store'

const openTabsKey = 'open-tabs-repository-ids'
const activeTabIndexKey = 'active-tab-index'

/**
 * The parts of `AppStore` that Gait needs. AppStore passes an implementation
 * of this to `GaitStore` so that Gait code can live outside of app-store.ts.
 */
export interface IGaitStoreHost {
  readonly emitUpdate: () => void
  readonly emitError: (error: Error) => void
  readonly selectRepository: (
    repository: Repository
  ) => Promise<Repository | null>
  readonly getGitStore: (repository: Repository) => GitStore
  readonly getRepositoryState: (repository: Repository) => IRepositoryState
  readonly withPushPullFetch: (
    repository: Repository,
    fn: () => Promise<void>
  ) => Promise<void>
  readonly withRefreshedGitHubRepository: <T>(
    repository: Repository,
    fn: (repository: Repository) => Promise<T>
  ) => Promise<T>
  readonly updatePushPullFetchProgress: (
    repository: Repository,
    progress: Progress | null
  ) => void
  readonly fastForwardBranches: (repository: Repository) => Promise<void>
  readonly refreshBranchProtectionState: (
    repository: Repository
  ) => Promise<void>
  readonly refreshRepository: (repository: Repository) => Promise<void>
  readonly addRepositories: (
    paths: ReadonlyArray<string>
  ) => Promise<ReadonlyArray<Repository>>
  readonly addAccount: (account: Account) => Promise<void>
}

/** Gait state (tabs, panels) and Gait-specific git operations */
export class GaitStore {
  /** Whether the npm scripts panel is visible */
  private showNpmScriptsPanel: boolean = true

  /** Whether the terminal panel is visible */
  private showTerminalPanel: boolean = true

  /** Whether the Claude chat panel is visible */
  private showClaudeChatPanel: boolean = false

  /** Open repository tabs */
  private openTabs: ReadonlyArray<ITabState> = []

  /** Index of the currently active tab */
  private activeTabIndex: number = -1

  public constructor(private readonly host: IGaitStoreHost) {}

  public getState(): IGaitState {
    return {
      showNpmScriptsPanel: this.showNpmScriptsPanel,
      showTerminalPanel: this.showTerminalPanel,
      showClaudeChatPanel: this.showClaudeChatPanel,
      openTabs: this.openTabs,
      activeTabIndex: this.activeTabIndex,
    }
  }

  /** Toggle the npm scripts panel visibility */
  public toggleNpmScriptsPanel(): void {
    this.showNpmScriptsPanel = !this.showNpmScriptsPanel
    this.host.emitUpdate()
  }

  /** Toggle the terminal panel visibility */
  public toggleTerminalPanel(): void {
    this.showTerminalPanel = !this.showTerminalPanel
    this.host.emitUpdate()
  }

  /** Toggle the Claude chat panel visibility */
  public toggleClaudeChatPanel(): void {
    this.showClaudeChatPanel = !this.showClaudeChatPanel
    this.host.emitUpdate()
  }

  /** Save open tabs to localStorage */
  private saveOpenTabs(): void {
    const tabIds = this.openTabs.map(t => t.repository.id)
    setNumberArray(openTabsKey, tabIds)
    setNumber(activeTabIndexKey, this.activeTabIndex)
  }

  /** Restore open tabs from localStorage */
  public restoreOpenTabs(repositories: ReadonlyArray<Repository>): void {
    const savedTabIds = getNumberArray(openTabsKey)
    const savedActiveIndex = getNumber(activeTabIndexKey, 0)

    if (savedTabIds.length === 0) {
      return
    }

    const restoredTabs: ITabState[] = []
    for (const id of savedTabIds) {
      const repo = repositories.find(r => r.id === id)
      if (repo) {
        restoredTabs.push({ repository: repo, branchName: null })
      }
    }

    if (restoredTabs.length > 0) {
      this.openTabs = restoredTabs
      this.activeTabIndex = Math.min(savedActiveIndex, restoredTabs.length - 1)

      const activeTab = this.openTabs[this.activeTabIndex]
      if (activeTab) {
        this.host.selectRepository(activeTab.repository)
      }
    }
  }

  /** Open a repository in a new tab or switch to existing tab */
  public openTab(repository: Repository): void {
    const existingIndex = this.openTabs.findIndex(
      t => t.repository.id === repository.id
    )

    if (existingIndex >= 0) {
      this.activeTabIndex = existingIndex
    } else {
      const branchName = this.getCurrentBranchName(repository)
      const newTab: ITabState = { repository, branchName }
      this.openTabs = [...this.openTabs, newTab]
      this.activeTabIndex = this.openTabs.length - 1
    }

    this.saveOpenTabs()
    this.host.emitUpdate()
    this.host.selectRepository(repository)
  }

  /** Close a tab by index */
  public closeTab(index: number): void {
    if (index < 0 || index >= this.openTabs.length) {
      return
    }

    // Don't close the last tab
    if (this.openTabs.length <= 1) {
      return
    }

    const tabs = [...this.openTabs]
    tabs.splice(index, 1)
    this.openTabs = tabs

    if (this.activeTabIndex >= tabs.length) {
      this.activeTabIndex = tabs.length - 1
    } else if (index < this.activeTabIndex) {
      this.activeTabIndex = this.activeTabIndex - 1
    } else if (index === this.activeTabIndex) {
      // Switch to the tab that took the closed tab's position
      this.activeTabIndex = Math.min(index, tabs.length - 1)
    }

    const activeTab = this.openTabs[this.activeTabIndex]
    if (activeTab) {
      this.host.selectRepository(activeTab.repository)
    }

    this.saveOpenTabs()
    this.host.emitUpdate()
  }

  /** Switch to a tab by index */
  public selectTab(index: number): void {
    if (index < 0 || index >= this.openTabs.length) {
      return
    }

    this.activeTabIndex = index
    const tab = this.openTabs[index]
    this.saveOpenTabs()
    this.host.emitUpdate()
    this.host.selectRepository(tab.repository)
  }

  /** Move a tab from one position to another */
  public moveTab(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.openTabs.length ||
      toIndex < 0 ||
      toIndex >= this.openTabs.length
    ) {
      return
    }

    const tabs = [...this.openTabs]
    const [moved] = tabs.splice(fromIndex, 1)
    tabs.splice(toIndex, 0, moved)
    this.openTabs = tabs

    // Update active index to follow the active tab
    if (this.activeTabIndex === fromIndex) {
      this.activeTabIndex = toIndex
    } else if (
      fromIndex < this.activeTabIndex &&
      toIndex >= this.activeTabIndex
    ) {
      this.activeTabIndex--
    } else if (
      fromIndex > this.activeTabIndex &&
      toIndex <= this.activeTabIndex
    ) {
      this.activeTabIndex++
    }

    this.saveOpenTabs()
    this.host.emitUpdate()
  }

  /** Update the tab's branch name when the repository's git store updates */
  public onRepositoryUpdated(repository: Repository): void {
    const branchName = this.getCurrentBranchName(repository)
    const tabIndex = this.openTabs.findIndex(
      t => t.repository.id === repository.id
    )

    if (tabIndex >= 0) {
      const tabs = [...this.openTabs]
      tabs[tabIndex] = { ...tabs[tabIndex], branchName }
      this.openTabs = tabs
    }
  }

  /** Get the current branch name for a repository */
  private getCurrentBranchName(repository: Repository): string | null {
    try {
      const tip = this.host.getGitStore(repository).tip
      if (tip.kind === TipState.Valid) {
        return tip.branch.name
      }
    } catch {
      // ignore
    }
    return null
  }

  /** Ensure the selected repository has a tab open */
  public ensureTabForRepository(repository: Repository): void {
    const existingIndex = this.openTabs.findIndex(
      t => t.repository.id === repository.id
    )

    if (existingIndex < 0) {
      const branchName = this.getCurrentBranchName(repository)
      const newTab: ITabState = { repository, branchName }
      this.openTabs = [...this.openTabs, newTab]
      this.activeTabIndex = this.openTabs.length - 1
    } else {
      this.activeTabIndex = existingIndex
    }

    this.saveOpenTabs()
  }

  /** Pull with rebase from the current remote. */
  public async pullRebase(repository: Repository): Promise<void> {
    return this.host.withRefreshedGitHubRepository(repository, repository =>
      this.performPullRebase(repository)
    )
  }

  private async performPullRebase(repository: Repository): Promise<void> {
    const { host } = this

    return host.withPushPullFetch(repository, async () => {
      const gitStore = host.getGitStore(repository)
      const remote = gitStore.currentRemote

      if (!remote) {
        throw new Error('The repository has no remotes.')
      }

      const state = host.getRepositoryState(repository)
      const tip = state.branchesState.tip

      if (tip.kind === TipState.Unborn) {
        throw new Error('The current branch is unborn.')
      }

      if (tip.kind === TipState.Detached) {
        throw new Error('The current repository is in a detached HEAD state.')
      }

      if (tip.kind === TipState.Valid) {
        const title = `Pulling ${remote.name} (rebase)`
        const kind = 'pull'
        host.updatePushPullFetchProgress(repository, {
          kind,
          title,
          value: 0,
          remote: remote.name,
        })

        try {
          const pullWeight = 0.6

          await gitStore.performFailableOperation(
            async () => {
              await pullRebase(repository, remote, {
                progressCallback: progress => {
                  host.updatePushPullFetchProgress(repository, {
                    ...progress,
                    value: progress.value * pullWeight,
                  })
                },
              })
              return true
            },
            {
              retryAction: {
                type: RetryActionType.Pull,
                repository,
              },
            }
          )

          const refreshTitle = __DARWIN__
            ? 'Refreshing Repository'
            : 'Refreshing repository'

          host.updatePushPullFetchProgress(repository, {
            kind: 'generic',
            title: refreshTitle,
            description: 'Fast-forwarding branches',
            value: pullWeight,
          })

          await host.fastForwardBranches(repository)
          await host.refreshBranchProtectionState(repository)
          await host.refreshRepository(repository)
        } finally {
          host.updatePushPullFetchProgress(repository, null)
        }
      }
    })
  }

  /** Rebase current branch onto the default branch (main/master). */
  public async rebaseOntoDefaultBranch(
    repository: Repository
  ): Promise<IRebaseOntoResult | null> {
    const state = this.host.getRepositoryState(repository)
    const { branchesState } = state
    const { allBranches, tip } = branchesState

    if (tip.kind !== TipState.Valid) {
      return null
    }

    const defaultBranch = await findDefaultBranch(repository, allBranches)
    if (defaultBranch === null) {
      return null
    }

    // Don't rebase if we're already on the default branch
    if (tip.branch.name === defaultBranch.name) {
      return null
    }

    // Check for dirty working tree
    const isClean = await isWorkingTreeClean(repository)
    if (!isClean) {
      this.host.emitUpdate()
      return null
    }

    const result = await rebaseOntoDefaultBranch(repository, defaultBranch)

    // Refresh the repository state after rebase
    await this.host.refreshRepository(repository)

    return result
  }

  /** Reset the current branch to match origin. */
  public async resetToOrigin(repository: Repository): Promise<void> {
    const { host } = this
    const state = host.getRepositoryState(repository)
    const { branchesState } = state
    const { tip } = branchesState

    if (tip.kind !== TipState.Valid) {
      return
    }

    const branchName = tip.branch.name
    const gitStore = host.getGitStore(repository)
    const remote = gitStore.currentRemote

    if (!remote) {
      return
    }

    await host.withPushPullFetch(repository, async () => {
      try {
        host.updatePushPullFetchProgress(repository, {
          kind: 'generic',
          title: `Resetting to origin/${branchName}`,
          value: 0,
        })

        await resetToOrigin(repository, branchName, remote.url)

        host.updatePushPullFetchProgress(repository, {
          kind: 'generic',
          title: 'Refreshing repository',
          value: 0.8,
        })

        await host.refreshRepository(repository)
      } finally {
        host.updatePushPullFetchProgress(repository, null)
      }
    })
  }

  /**
   * Create a git worktree for the given branch and open it as a new
   * repository tab.
   */
  public async createWorktreeForBranch(
    repository: Repository,
    branchName: string
  ): Promise<void> {
    // Place the worktree in a sibling directory named
    // `<repo-basename>--<branch>` (e.g. feature/foo → repo--feature-foo)
    const safeBranch = branchName.replace(/[/\\:*?"<>|]/g, '-')
    const worktreePath = Path.resolve(
      repository.path,
      '..',
      `${Path.basename(repository.path)}--${safeBranch}`
    )
    try {
      await addWorktree(repository, worktreePath, { commitish: branchName })
    } catch (e: any) {
      this.host.emitError(
        new Error(
          `Failed to create worktree for branch "${branchName}": ${e.message}`
        )
      )
      return
    }

    const addedRepos = await this.host.addRepositories([worktreePath])
    if (addedRepos.length > 0) {
      this.openTab(addedRepos[0])
    }
  }

  /** Import accounts, repositories, and preferences from GitHub Desktop. */
  public async importFromGitHubDesktop(
    accounts: ReadonlyArray<IGHDAccount>,
    repositories: ReadonlyArray<string>,
    preferences: IGHDPreferences | null
  ): Promise<void> {
    // Import accounts with tokens
    for (const a of accounts) {
      if (!a.token) {
        continue
      }

      const account = new Account(
        a.login,
        a.endpoint,
        a.token,
        a.emails.map(e => ({
          email: e,
          verified: true,
          primary: false,
          visibility: null,
        })),
        a.avatarURL,
        a.id,
        a.name
      )

      await this.host.addAccount(account)
    }

    // Import repositories
    if (repositories.length > 0) {
      await this.host.addRepositories(repositories)
    }

    // Import preferences
    if (preferences) {
      if (preferences.externalEditor) {
        localStorage.setItem('externalEditor', preferences.externalEditor)
      }
      if (preferences.shell) {
        localStorage.setItem('shell', preferences.shell)
      }
      if (preferences.theme) {
        localStorage.setItem('theme', preferences.theme)
      }
      if (preferences.hideWhitespaceInDiff) {
        localStorage.setItem(
          'hide-whitespace-in-diff',
          preferences.hideWhitespaceInDiff
        )
      }
    }

    log.info(
      `[GaitStore] Imported from GitHub Desktop: ${accounts.length} accounts, ${repositories.length} repositories`
    )
  }
}

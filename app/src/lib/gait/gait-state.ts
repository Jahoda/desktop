import { Repository } from '../../models/repository'

/** State for an open repository tab */
export interface ITabState {
  readonly repository: Repository
  readonly branchName: string | null
}

/** Gait-specific app state, exposed as `IAppState.gait` */
export interface IGaitState {
  /** Whether the npm scripts panel is visible */
  readonly showNpmScriptsPanel: boolean

  /** Whether the terminal panel is visible */
  readonly showTerminalPanel: boolean

  /** Whether the Claude chat panel is visible */
  readonly showClaudeChatPanel: boolean

  /** Open repository tabs */
  readonly openTabs: ReadonlyArray<ITabState>

  /** Index of the currently active tab */
  readonly activeTabIndex: number
}

import * as React from 'react'
import { IGaitState } from '../../lib/gait/gait-state'
import { PossibleSelections, SelectionType } from '../../lib/app-state'
import {
  detectMonorepoScripts,
  IMonorepoScripts,
} from '../../lib/npm/script-detector'
import { Repository } from '../../models/repository'
import { TipState } from '../../models/tip'
import { NpmScriptsPanel } from '../npm-scripts/npm-scripts-panel'
import { TerminalPanel } from '../terminal/terminal-panel'
import { ClaudeChatPanel } from '../claude-chat/claude-chat-panel'

interface IGaitMainContentProps {
  readonly gait: IGaitState
  readonly selectedState: PossibleSelections | null

  /** The upstream repository view */
  readonly children?: React.ReactNode
}

interface IGaitMainContentState {
  /** Detected npm scripts for the selected repository (null until known) */
  readonly npmScripts: IMonorepoScripts | null
}

/**
 * Wraps the repository view with the Gait panels: npm scripts and terminal
 * below it, Claude chat on the right.
 */
export class GaitMainContent extends React.Component<
  IGaitMainContentProps,
  IGaitMainContentState
> {
  private npmScriptsRepoPath: string | null = null
  private unmounted = false

  public constructor(props: IGaitMainContentProps) {
    super(props)
    this.state = { npmScripts: null }
  }

  public componentDidMount() {
    this.detectNpmScripts()
  }

  public componentDidUpdate() {
    this.detectNpmScripts()
  }

  public componentWillUnmount() {
    this.unmounted = true
  }

  private getRepository(): Repository | null {
    const repository = this.props.selectedState?.repository
    return repository instanceof Repository ? repository : null
  }

  /** Detect scripts lazily (only while the panel is shown), cached per repo */
  private detectNpmScripts() {
    const repo = this.getRepository()
    if (!this.props.gait.showNpmScriptsPanel || repo === null) {
      return
    }

    if (this.npmScriptsRepoPath === repo.path) {
      return
    }

    const repoPath = repo.path
    this.npmScriptsRepoPath = repoPath
    this.setState({ npmScripts: null })

    detectMonorepoScripts(repoPath).then(npmScripts => {
      if (!this.unmounted && this.npmScriptsRepoPath === repoPath) {
        this.setState({ npmScripts })
      }
    })
  }

  private renderNpmScriptsPanel(repo: Repository) {
    const { npmScripts } = this.state
    if (!this.props.gait.showNpmScriptsPanel || npmScripts === null) {
      return null
    }

    return (
      <NpmScriptsPanel
        repoPath={repo.path}
        rootScripts={npmScripts.rootScripts}
        workspaces={npmScripts.workspaces}
        manager={npmScripts.manager}
      />
    )
  }

  private renderTerminalPanel(repo: Repository) {
    if (!this.props.gait.showTerminalPanel) {
      return null
    }

    return <TerminalPanel cwd={repo.path} repoId={repo.id} />
  }

  private renderClaudeChatPanel(repo: Repository) {
    if (!this.props.gait.showClaudeChatPanel) {
      return null
    }

    let branchName: string | null = null
    const { selectedState } = this.props
    if (
      selectedState !== null &&
      selectedState.type === SelectionType.Repository
    ) {
      const { tip } = selectedState.state.branchesState
      if (tip.kind === TipState.Valid) {
        branchName = tip.branch.name
      }
    }

    return (
      <ClaudeChatPanel
        cwd={repo.path}
        repoId={repo.id}
        branchName={branchName}
      />
    )
  }

  public render() {
    const repo = this.getRepository()

    return (
      <div id="main-content-row">
        <div id="main-content-column">
          {this.props.children}
          {repo && this.renderNpmScriptsPanel(repo)}
          {repo && this.renderTerminalPanel(repo)}
        </div>
        {repo && this.renderClaudeChatPanel(repo)}
      </div>
    )
  }
}

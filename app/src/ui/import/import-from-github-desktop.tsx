import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  IGitHubDesktopImportData,
  IGHDAccount,
  IGHDPreferences,
  scanGitHubDesktop,
} from '../../lib/import/github-desktop-importer'

interface IImportFromGitHubDesktopProps {
  readonly onDismissed: () => void
  readonly onImport: (
    accounts: ReadonlyArray<IGHDAccount>,
    repositories: ReadonlyArray<string>,
    preferences: IGHDPreferences | null
  ) => Promise<void>
}

interface IImportFromGitHubDesktopState {
  readonly loading: boolean
  readonly importing: boolean
  readonly data: IGitHubDesktopImportData | null
  readonly error: string | null
  readonly selectedRepos: Set<string>
  readonly selectedAccounts: Set<string>
  readonly importPreferences: boolean
}

export class ImportFromGitHubDesktop extends React.Component<
  IImportFromGitHubDesktopProps,
  IImportFromGitHubDesktopState
> {
  public constructor(props: IImportFromGitHubDesktopProps) {
    super(props)
    this.state = {
      loading: true,
      importing: false,
      data: null,
      error: null,
      selectedRepos: new Set(),
      selectedAccounts: new Set(),
      importPreferences: true,
    }
  }

  public async componentDidMount() {
    try {
      const data = await scanGitHubDesktop()
      if (!data) {
        this.setState({
          loading: false,
          error: 'GitHub Desktop installation not found.',
        })
        return
      }

      const selectedRepos = new Set(data.repositories)
      const selectedAccounts = new Set(
        data.accounts.map(a => `${a.login}@${a.endpoint}`)
      )

      this.setState({ loading: false, data, selectedRepos, selectedAccounts })
    } catch (e) {
      this.setState({
        loading: false,
        error: `Failed to scan GitHub Desktop: ${e}`,
      })
    }
  }

  private onToggleRepo = (repoPath: string) => {
    const { selectedRepos } = this.state
    const updated = new Set(selectedRepos)
    if (updated.has(repoPath)) {
      updated.delete(repoPath)
    } else {
      updated.add(repoPath)
    }
    this.setState({ selectedRepos: updated })
  }

  private onToggleAccount = (key: string) => {
    const { selectedAccounts } = this.state
    const updated = new Set(selectedAccounts)
    if (updated.has(key)) {
      updated.delete(key)
    } else {
      updated.add(key)
    }
    this.setState({ selectedAccounts: updated })
  }

  private onTogglePreferences = (e: React.FormEvent<HTMLInputElement>) => {
    this.setState({ importPreferences: e.currentTarget.checked })
  }

  private onSelectAllRepos = () => {
    const { data, selectedRepos } = this.state
    if (!data) {
      return
    }

    if (selectedRepos.size === data.repositories.length) {
      this.setState({ selectedRepos: new Set() })
    } else {
      this.setState({ selectedRepos: new Set(data.repositories) })
    }
  }

  private onSubmit = async () => {
    const { data, selectedRepos, selectedAccounts, importPreferences } =
      this.state
    if (!data) {
      return
    }

    this.setState({ importing: true })

    const accounts = data.accounts.filter(a =>
      selectedAccounts.has(`${a.login}@${a.endpoint}`)
    )
    const repositories = data.repositories.filter(r => selectedRepos.has(r))
    const preferences = importPreferences ? data.preferences : null

    await this.props.onImport(accounts, repositories, preferences)
    this.props.onDismissed()
  }

  private hasAnythingToImport(): boolean {
    const { data } = this.state
    if (!data) {
      return false
    }
    return (
      data.accounts.length > 0 ||
      data.repositories.length > 0 ||
      Object.values(data.preferences).some(v => v !== undefined)
    )
  }

  private hasAnythingSelected(): boolean {
    const { selectedRepos, selectedAccounts, importPreferences, data } =
      this.state
    if (!data) {
      return false
    }

    const hasPrefs =
      importPreferences &&
      Object.values(data.preferences).some(v => v !== undefined)

    return selectedRepos.size > 0 || selectedAccounts.size > 0 || hasPrefs
  }

  private renderAccounts() {
    const { data, selectedAccounts } = this.state
    if (!data || data.accounts.length === 0) {
      return null
    }

    return (
      <div className="import-section">
        <h3>Accounts</h3>
        {data.accounts.map(a => {
          const key = `${a.login}@${a.endpoint}`
          const hasToken = a.token.length > 0
          const label = hasToken
            ? `${a.login} (${a.endpoint.includes('github.com') ? 'GitHub.com' : a.endpoint})`
            : `${a.login} (no token found)`

          return (
            <Checkbox
              key={key}
              label={label}
              value={
                selectedAccounts.has(key)
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              disabled={!hasToken}
              onChange={() => this.onToggleAccount(key)}
            />
          )
        })}
      </div>
    )
  }

  private renderRepositories() {
    const { data, selectedRepos } = this.state
    if (!data || data.repositories.length === 0) {
      return null
    }

    const allSelected = selectedRepos.size === data.repositories.length

    return (
      <div className="import-section">
        <h3>
          Repositories ({selectedRepos.size}/{data.repositories.length})
          <button
            className="import-select-all-btn"
            onClick={this.onSelectAllRepos}
            type="button"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </h3>
        <div className="import-repo-list">
          {data.repositories.map(repoPath => {
            const name = repoPath.split('/').pop() || repoPath
            return (
              <div key={repoPath} className="import-repo-item">
                <Checkbox
                  label={name}
                  value={
                    selectedRepos.has(repoPath)
                      ? CheckboxValue.On
                      : CheckboxValue.Off
                  }
                  onChange={() => this.onToggleRepo(repoPath)}
                />
                <span className="import-repo-path">{repoPath}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  private renderPreferences() {
    const { data, importPreferences } = this.state
    if (!data) {
      return null
    }

    const prefs = data.preferences
    const prefEntries: Array<{ label: string; value: string }> = []

    if (prefs.externalEditor) {
      prefEntries.push({ label: 'Editor', value: prefs.externalEditor })
    }
    if (prefs.shell) {
      prefEntries.push({ label: 'Shell', value: prefs.shell })
    }
    if (prefs.theme) {
      prefEntries.push({ label: 'Theme', value: prefs.theme })
    }

    if (prefEntries.length === 0) {
      return null
    }

    return (
      <div className="import-section">
        <h3>Preferences</h3>
        <Checkbox
          label="Import preferences"
          value={
            importPreferences ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onTogglePreferences}
        />
        {importPreferences && (
          <div className="import-pref-details">
            {prefEntries.map(p => (
              <div key={p.label} className="import-pref-item">
                <span className="import-pref-label">{p.label}:</span>{' '}
                <span className="import-pref-value">{p.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  public render() {
    const { loading, importing, error, data } = this.state

    return (
      <Dialog
        id="import-from-github-desktop"
        title="Import from GitHub Desktop"
        loading={loading || importing}
        disabled={importing}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          {error && <p className="import-error">{error}</p>}
          {!loading && !error && !this.hasAnythingToImport() && (
            <p>No data found to import from GitHub Desktop.</p>
          )}
          {data && this.hasAnythingToImport() && (
            <>
              {this.renderAccounts()}
              {this.renderRepositories()}
              {this.renderPreferences()}
            </>
          )}
        </DialogContent>
        {!error && this.hasAnythingToImport() && (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="Import"
              okButtonDisabled={!this.hasAnythingSelected()}
            />
          </DialogFooter>
        )}
      </Dialog>
    )
  }
}

import * as React from 'react'
import { Repository } from '../../models/repository'
import { getHTMLURL } from '../../lib/api'

interface IRepoIconProps {
  readonly repository: Repository
}

interface IRepoIconState {
  readonly avatarUrl: string | null
  readonly avatarFailed: boolean
}

/**
 * Generate a deterministic color from a string.
 */
function colorFromString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, 60%, 50%)`
}

export class RepoIcon extends React.Component<IRepoIconProps, IRepoIconState> {
  public constructor(props: IRepoIconProps) {
    super(props)

    const avatarUrl = this.getAvatarUrl(props.repository)
    this.state = {
      avatarUrl,
      avatarFailed: false,
    }
  }

  public componentDidUpdate(prevProps: IRepoIconProps) {
    if (prevProps.repository.id !== this.props.repository.id) {
      const avatarUrl = this.getAvatarUrl(this.props.repository)
      this.setState({ avatarUrl, avatarFailed: false })
    }
  }

  private getAvatarUrl(repository: Repository): string | null {
    const ghRepo = repository.gitHubRepository
    if (!ghRepo) {
      return null
    }

    const owner = ghRepo.owner
    const endpoint = owner.endpoint
    const baseUrl = getHTMLURL(endpoint)
    return `${baseUrl}/${owner.login}.png?size=64`
  }

  private onImageError = () => {
    this.setState({ avatarFailed: true })
  }

  public render() {
    const { repository } = this.props
    const { avatarUrl, avatarFailed } = this.state
    const name = repository.name
    const borderColor = colorFromString(name)

    if (avatarUrl && !avatarFailed) {
      return (
        <div
          className="repo-icon repo-icon-wrapper"
          style={{ borderColor }}
        >
          <img
            className="repo-icon-avatar"
            src={avatarUrl}
            alt=""
            onError={this.onImageError}
          />
        </div>
      )
    }

    // Fallback: colored initial
    const initial = name.charAt(0).toUpperCase()
    return (
      <div
        className="repo-icon repo-icon-fallback"
        style={{ backgroundColor: borderColor }}
        title={name}
      >
        {initial}
      </div>
    )
  }
}

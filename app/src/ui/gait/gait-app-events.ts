import { GaitMenuEvent } from '../../main-process/menu/gait-menu-event'
import { PossibleSelections, SelectionType } from '../../lib/app-state'
import { PopupType } from '../../models/popup'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'

/** Handle the menu events emitted by Gait-specific menu items */
export function handleGaitMenuEvent(
  name: GaitMenuEvent,
  dispatcher: Dispatcher,
  selectedState: PossibleSelections | null
) {
  const repository = selectedState?.repository

  switch (name) {
    case 'pull-rebase':
      if (selectedState?.type === SelectionType.Repository) {
        return dispatcher.gait.pullRebase(selectedState.repository)
      }
      return
    case 'rebase-onto-default-branch':
      if (repository instanceof Repository) {
        return dispatcher.gait.rebaseOntoDefaultBranch(repository)
      }
      return
    case 'toggle-npm-scripts-panel':
      return dispatcher.gait.toggleNpmScriptsPanel()
    case 'toggle-terminal-panel':
      return dispatcher.gait.toggleTerminalPanel()
    case 'toggle-claude-chat-panel':
      return dispatcher.gait.toggleClaudeChatPanel()
    case 'import-from-github-desktop':
      return dispatcher.showPopup({ type: PopupType.ImportFromGitHubDesktop })
  }
}

/**
 * Install global keyboard shortcuts for Gait features: terminal toggle
 * (Cmd/Ctrl+`), Claude chat toggle (Cmd/Ctrl+Shift+I) and tab switching
 * (Cmd/Ctrl+1-9). Returns a function which removes them again.
 */
export function installGaitShortcuts(
  dispatcher: Dispatcher,
  getTabCount: () => number
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    const modifier = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (!modifier) {
      return
    }

    // Cmd/Ctrl+` toggles terminal
    if (event.key === '`' && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      dispatcher.gait.toggleTerminalPanel()
      return
    }

    // Cmd/Ctrl+Shift+I toggles Claude chat panel
    if (event.key === 'I' && event.shiftKey && !event.altKey) {
      event.preventDefault()
      dispatcher.gait.toggleClaudeChatPanel()
      return
    }

    // Cmd/Ctrl+1-9 switches tabs
    if (!event.shiftKey && !event.altKey) {
      const num = parseInt(event.key, 10)
      if (num >= 1 && num <= 9) {
        const tabIndex = num - 1
        if (tabIndex < getTabCount()) {
          event.preventDefault()
          dispatcher.gait.selectTab(tabIndex)
        }
      }
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}

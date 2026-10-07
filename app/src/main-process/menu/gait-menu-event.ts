/** Menu events emitted by Gait-specific menu items */
export type GaitMenuEvent =
  | 'pull-rebase'
  | 'rebase-onto-default-branch'
  | 'toggle-npm-scripts-panel'
  | 'toggle-terminal-panel'
  | 'toggle-claude-chat-panel'
  | 'import-from-github-desktop'

const gaitMenuEvents: ReadonlyArray<GaitMenuEvent> = [
  'pull-rebase',
  'rebase-onto-default-branch',
  'toggle-npm-scripts-panel',
  'toggle-terminal-panel',
  'toggle-claude-chat-panel',
  'import-from-github-desktop',
]

export function isGaitMenuEvent(name: string): name is GaitMenuEvent {
  return (gaitMenuEvents as ReadonlyArray<string>).includes(name)
}

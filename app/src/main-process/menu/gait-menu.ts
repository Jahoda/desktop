import { emit, separator } from './build-default-menu'

type MenuItem = Electron.MenuItemConstructorOptions

/**
 * Rebrand the upstream menu template and insert Gait menu items next to the
 * upstream items they relate to (located by id).
 */
export function addGaitMenuItems(template: MenuItem[]) {
  rebrand(template)

  insertAfter(template, 'clone-repository', [
    separator,
    {
      label: 'Import from GitHub Desktop…',
      id: 'import-from-github-desktop',
      click: emit('import-from-github-desktop'),
    },
  ])

  insertAfter(template, 'toggle-changes-filter', [
    separator,
    {
      label: __DARWIN__
        ? 'Toggle NPM Scripts Panel'
        : 'Toggle NPM Scripts &Panel',
      id: 'toggle-npm-scripts-panel',
      click: emit('toggle-npm-scripts-panel'),
    },
    {
      label: __DARWIN__ ? 'Toggle Terminal' : 'Toggle &Terminal',
      id: 'toggle-terminal-panel',
      accelerator: 'CmdOrCtrl+`',
      click: emit('toggle-terminal-panel'),
    },
    {
      label: __DARWIN__ ? 'Toggle Claude Chat' : 'Toggle Claude &Chat',
      id: 'toggle-claude-chat-panel',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: emit('toggle-claude-chat-panel'),
    },
    separator,
  ])

  insertAfter(template, 'pull', [
    {
      id: 'pull-rebase',
      label: __DARWIN__ ? 'Pull (Rebase)' : 'Pull (&Rebase)',
      accelerator: 'CmdOrCtrl+Shift+R',
      click: emit('pull-rebase'),
    },
  ])

  insertAfter(template, 'rebase-branch', [
    {
      label: __DARWIN__
        ? 'Rebase onto Default Branch'
        : 'Rebase onto &default branch',
      id: 'rebase-onto-default-branch',
      click: emit('rebase-onto-default-branch'),
    },
  ])
}

/** Replace "GitHub Desktop" with "Gait Desktop" in the app and About labels */
function rebrand(items: MenuItem[]) {
  for (const item of items) {
    if (
      item.label !== undefined &&
      /^(&?About )?GitHub Desktop$/.test(item.label)
    ) {
      item.label = item.label.replace('GitHub Desktop', 'Gait Desktop')
    }
    if (Array.isArray(item.submenu)) {
      rebrand(item.submenu)
    }
  }
}

/** Insert items after the (first) menu item with the given id */
function insertAfter(
  items: MenuItem[],
  id: string,
  newItems: ReadonlyArray<MenuItem>
): boolean {
  const index = items.findIndex(item => item.id === id)
  if (index >= 0) {
    items.splice(index + 1, 0, ...newItems)
    return true
  }

  return items.some(
    item =>
      Array.isArray(item.submenu) && insertAfter(item.submenu, id, newItems)
  )
}

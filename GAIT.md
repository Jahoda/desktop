# Gait Desktop

Gait is a fork of [GitHub Desktop](https://github.com/desktop/desktop) with
repository tabs, an npm scripts panel, a terminal, an in-app file editor, a
Claude chat panel and extra git actions (pull --rebase, rebase on main, reset
to origin).

## Keeping upstream merges easy

Gait code lives in its own files. Upstream files only get small, clearly
marked hooks (`Gait:` comments), so merging upstream rarely conflicts.

| Area | Gait code | Hook in upstream file |
| --- | --- | --- |
| State & git operations | `app/src/lib/stores/gait-store.ts` | `app-store.ts` (`gait` field + 3 calls), `app-state.ts` (`gait`), `dispatcher.ts` (`gait` getter) |
| UI | `app/src/ui/gait/*` | `app.tsx` (top bar, main content, toolbar buttons, popups, menu events, shortcuts) |
| Popups | `app/src/ui/gait/gait-popups.tsx` | `models/popup.ts` (entries at the top of the enum/union) |
| IPC | `app/src/lib/gait/ipc-channels.ts`, `app/src/main-process/gait-ipc.ts` | `ipc-shared.ts` (type intersection), `main.ts` (one call) |
| Menu | `app/src/main-process/menu/gait-menu*.ts` | `build-default-menu.ts` (one call), `menu-event.ts` (one union member) |
| Styles | `app/styles/_gait.scss` | `desktop.scss` (one import) |
| Branding | `app/gait-branding.json`, `app/static/logos/gait/` | `package-info.ts`, `app-info.ts`, `script/dist-info.ts` |

Rules of thumb:

- Put new features in new files and connect them with a one-line hook.
- When an upstream list must be extended (enum, union, imports), add the Gait
  entries at the start, not at the end where upstream appends.
- Don't edit `app/package.json` identity fields; use `app/gait-branding.json`.
- To change the app icon edit `app/static/logos/gait/icon-logo.icon` and run
  `script/gait-build-icon-assets.sh` (needs Xcode).

## Merging upstream

One-time setup in a clone:

```sh
git remote add upstream https://github.com/desktop/desktop.git
git config rerere.enabled true
git config merge.ours.driver true
```

Then:

```sh
git fetch upstream
git checkout -b merge-upstream
git merge upstream/development
yarn install && yarn test && yarn build:prod
```

`rerere` remembers how conflicts were resolved, and `merge=ours` in
`.gitattributes` keeps the Gait-branded images.

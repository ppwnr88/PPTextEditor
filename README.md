# PPText Editor

PPText Editor is a keyboard-first desktop code editor built with `Tauri`, `Rust`, `React`, and `Monaco`.
It focuses on clean chrome, local workspaces, fast file switching, and an editor that stays out of the way.

Landing page: [editor.wannarat.cc](https://editor.wannarat.cc)

## Highlights

- `macOS-first` desktop editor with native app packaging
- local workspace browsing with persistent folder state
- Monaco-based editing with syntax highlighting for many text file types
- multi-tab workflow with middle-click tab close
- command palette and Goto Anything style navigation
- current-file search and workspace search
- theme, font, tab size, word wrap, and autosave settings
- GitHub personal access token connection for repo-oriented workflows

## Stack

- `Tauri 2`
- `Rust`
- `React 19`
- `TypeScript`
- `Monaco Editor`
- `Zustand`
- `Vite`

## Product Direction

PPText Editor keeps the product direction intentionally focused. The current version prioritizes:

- fast local editing
- clean, compact window chrome
- keyboard-first navigation
- practical daily-use file workflows

Out of scope for now:

- plugin marketplace
- remote development
- full Git UI
- IDE-level language intelligence

## Current Features

- open local files and folders
- persistent workspace tree with remembered expanded folders
- open, edit, save, and save-as flows
- untitled tabs for new files
- folder and file context menus in the explorer
- resizable and collapsible sidebar
- light and dark built-in themes
- configurable font face, font size, tab size, word wrap, and autosave
- GitHub account connection via personal access token
- native macOS-style app menu

## Development

Install dependencies:

```sh
pnpm install
```

Start the desktop app in development mode:

```sh
pnpm tauri dev
```

Build the frontend only:

```sh
pnpm build
```

Run tests:

```sh
pnpm test
cd src-tauri
cargo test
```

## Packaging

Build the macOS app bundle:

```sh
pnpm tauri build --bundles app
```

Build the macOS app bundle and website zip:

```sh
pnpm build:macos-release
```

Latest local app output:

- `src-tauri/target/release/bundle/macos/PPText Editor.app`
- `src-tauri/target/release/bundle/macos/PPText-Editor-macos-arm64.app.zip`

## Distribution

### macOS

macOS downloads are built locally and published as a zipped `.app` bundle on the landing page:

- `landing_page/downloads/PPText-Editor-macos-arm64.app.zip`

### Windows

Windows installers are published through GitHub Releases via GitHub Actions:

- `.exe` installer
- `.msi` installer

## Website

The landing page lives in:

- `landing_page/`

It is deployed to:

- [editor.wannarat.cc](https://editor.wannarat.cc)

## Repo Notes

- app name: `PPText Editor`
- bundle identifier: `com.ppwnr.subtext`
- current version: `0.1.0`

## Vision

PPText Editor aims to feel quick, calm, and intentional.
The goal is not more UI. The goal is less friction.

## License

MIT © ppwnr

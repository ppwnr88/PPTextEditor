# PPText Editor

PPText Editor is a macOS-first Tauri + React code editor MVP inspired by the fast, keyboard-first feel of Sublime Text.

## Features

- Local folder browsing with a file tree.
- Multi-tab Monaco editor with syntax highlighting and minimap.
- Dirty-state tracking, manual save, and optional autosave.
- Command palette and Goto Anything-style file opening.
- Current-file find and workspace text search.
- Persistent editor settings and recent files/folders.
- Internal extension hook for future command providers.

## Run

```sh
pnpm install
pnpm tauri dev
```

## Verify

```sh
pnpm test
pnpm build
cd src-tauri
cargo test
```

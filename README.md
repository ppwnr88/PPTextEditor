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

## macOS Release Signing

The GitHub Actions macOS release job now expects Apple signing credentials before it will publish a DMG.

Required GitHub secrets for macOS releases:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `KEYCHAIN_PASSWORD`

For notarization, provide one of these credential sets:

- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
- `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_PRIVATE_KEY`

This matches Tauri's macOS signing and notarization flow for direct-download DMGs.

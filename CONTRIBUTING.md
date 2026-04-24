# Contributing to PPText Editor

Thanks for taking the time to contribute.
PPText Editor is a focused desktop editor project, so the best contributions are usually the ones that improve speed, clarity, and everyday editing flow without making the app feel heavier.

## Before You Start

- check existing issues before opening a new one
- keep proposals aligned with the product direction in `README.md`
- prefer small, reviewable pull requests over large mixed changes

## Good Contribution Areas

- editor usability
- workspace and file tree behavior
- keyboard-first workflows
- theme and visual polish
- reliability fixes
- search and save flow improvements
- landing page and docs updates
- test coverage for existing behavior

## Please Avoid

- bundling unrelated refactors into one pull request
- changing established behavior without explaining the user impact
- adding heavy dependencies without a clear need
- introducing features that move the app toward IDE complexity unless discussed first

## Local Setup

Install dependencies:

```sh
pnpm install
```

Run the app in development:

```sh
pnpm tauri dev
```

Run frontend tests:

```sh
pnpm test
```

Run Rust tests:

```sh
cd src-tauri
cargo test
```

## Pull Request Guidelines

- keep the scope focused
- explain what changed and why
- include screenshots or screen recordings for UI changes when possible
- mention any tradeoffs, follow-up work, or limitations
- update docs if the behavior or setup changed

## Code Style

- follow the existing structure and naming patterns
- prefer readable code over clever code
- preserve the app's compact visual language
- keep comments short and useful

## Reporting Bugs

Helpful bug reports usually include:

- platform and OS version
- what you expected
- what happened instead
- exact steps to reproduce
- screenshots or logs if relevant

## Suggesting Features

Feature requests are most useful when they explain:

- the real user problem
- why the current workflow is not enough
- how the change fits the editor's focused direction

## Questions

If you are unsure whether something fits the project, open an issue first before building a large change.

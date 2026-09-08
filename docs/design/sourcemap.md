# Index of source code for MOU management system

## Index format is

- `<relative filepath from src>` : purpose of the source file.

## How to use this file

- Use this file to determine which source code file to load based "purpose" of the source code file
- Do not load all source code documents every time.
- Update the index whenever you add a new source code file.

## Sourcemap Index

### Monorepo root configuration

- `package.json` : npm workspace root. Declares the workspace globs (`src/*`, `tests/e2e`) and delegates every task to `turbo run`. Holds no build logic of its own.
- `turbo.json` : Turborepo task pipeline. Defines build/check-types/test/lint/dev/clean, their dependency order and cache outputs.
- `tsconfig.base.json` : Shared strict TypeScript compiler options. Every package tsconfig extends this; listed in turbo `globalDependencies` so a change busts the cache.

### `@mou/api` — backend service

- `src/api/package.json` : Package manifest and per-package task scripts for the backend workspace.
- `src/api/tsconfig.json` : Backend compiler config; extends the shared base, emits to `dist`.
- `src/api/src/index.ts` : Backend entry point. Placeholder until SPEC-01 is implemented.

### `@mou/web` — web frontend

- `src/web/package.json` : Package manifest and per-package task scripts for the frontend workspace.
- `src/web/tsconfig.json` : Frontend compiler config; extends the shared base, adds DOM libs.
- `src/web/src/index.ts` : Frontend entry point. Placeholder until the UI framework is chosen.

### `@mou/e2e` — cross-package tests

- `tests/e2e/package.json` : Manifest for the cross-package test workspace; depends on `@mou/api` and `@mou/web`.
- `tests/e2e/tsconfig.json` : Type-check-only config for the e2e workspace.
- `tests/e2e/src/workspace.test.ts` : Smoke test proving workspace linking and the turbo build-before-test ordering both work.

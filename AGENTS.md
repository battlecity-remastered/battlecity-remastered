# Agent Guide: BattleCity TypeScript Monorepo

## Quick Facts
- Legacy JavaScript app workspaces were removed.
- Active runtime is TypeScript-only:
  - `apps/client-ts` (Vite + Pixi.js)
  - `apps/server-ts` (Express + Socket.IO)
  - `packages/protocol` (schema/event envelope)
  - `packages/sim-core` (shared simulation logic)
- Default local ports:
  - client: `8220`
  - server: `8121`

## Runbook
- Install once at repo root: `npm install`
- Start both apps: `npm run dev`
- Start one app:
  - client: `npm run dev:client`
  - server: `npm run dev:server`
- Build client: `npm run build`
- Start server: `npm run start`

## Testing and Checks
- Tests: `npm run test`
- Typecheck: `npm run typecheck`
- Full strict verification: `npm run rewrite:check:strict`

## Structure
- `apps/client-ts/src`: client state, render, networking glue
- `apps/server-ts/src`: runtime loop, event dispatch, socket wiring
- `apps/client-ts/test`: client TS tests
- `apps/server-ts/test`: server TS tests
- `packages/protocol/src`: typed transport schemas
- `packages/sim-core/src`: simulation/combat primitives

## Conventions
- Prefer ESM imports with explicit extensions for relative imports.
- Keep protocol changes coordinated across app handlers.
- Keep shared gameplay math in `packages/sim-core` to avoid drift.

## Rewrite Docs
- Parity source docs are committed in-worktree under `docs/`:
  - `docs/typescript-gap-analysis.md`
  - `docs/typescript-gap-mapping.md`
- Maintain execution tracking in:
  - `docs/rewrite-progress.md`
  - `docs/parity-checklist.md`
  - `docs/event-parity-matrix.md`
  - `docs/parity-acceptance-criteria.md`
  - `docs/event-versioning.md`

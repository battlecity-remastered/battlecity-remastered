# BattleCity Remastered (TypeScript)

BattleCity Remastered now runs on a TypeScript monorepo stack:

- `apps/client-ts`: Pixi.js web client (Vite)
- `apps/server-ts`: Socket.IO + Express game server
- `packages/protocol`: shared wire/event schemas
- `packages/sim-core`: shared simulation/combat primitives

## Quick Start

1. Install dependencies:
   - `npm install`
2. Run both app processes:
   - `npm run dev`
3. Open the client:
   - `http://localhost:8220`
4. Server health endpoint:
   - `http://localhost:8121/health`

## Useful Commands

- `npm run dev:client` - start client only
- `npm run dev:server` - start server only
- `npm run build` - build the TypeScript client
- `npm run start` - run the TypeScript server
- `npm run test` - run TypeScript test suites (`packages/*`, `apps/*-ts`)
- `npm run typecheck` - run workspace type checks
- `npm run rewrite:check:strict` - strict TS rewrite verification suite

## Workspace Layout

- `apps/client-ts/src` - client runtime/input/render loop
- `apps/server-ts/src` - server runtime/event dispatch/ticks
- `apps/server-ts/test` - server TypeScript tests
- `apps/client-ts/test` - client TypeScript tests
- `packages/protocol/src` - typed event envelope/schema
- `packages/sim-core/src` - deterministic sim helpers

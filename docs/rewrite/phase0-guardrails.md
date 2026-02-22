# Rewrite Phase 0 Guardrails

This document defines the first implementation guardrails for the TypeScript + Effect rewrite.

## Goals

- Keep strict gameplay parity with legacy behavior.
- Prevent protocol drift while rewrite domains are migrated.
- Keep Node runtime aligned to `23.x` across local and CI.

## Baseline Commands

- Legacy server tests: `npm test --workspace server`
- Legacy client tests: `npm test --workspace client`
- Legacy cucumber harness: `npm run cucumber`
- Rewrite typecheck: `npm run rewrite:typecheck`
- Rewrite protocol inventory report: `npm run rewrite:event-inventory`
- Rewrite strict guardrail: `npm run rewrite:check:strict`

## Protocol Coverage Guardrail

- `scripts/rewrite-event-inventory.mjs` scans socket event names in:
  - `client/src`
  - `server`
  - `apps/client-ts/src`
  - `apps/server-ts/src`
- It compares discovered event names against `EventType` in `packages/protocol/src/envelope.ts`.
- Missing events are reported so protocol migration can be tracked incrementally.
- Use `npm run rewrite:event-inventory:strict` to fail CI once full protocol coverage is reached.
- CI now runs strict rewrite gates (`npm run rewrite:check:strict`) and legacy tests.

## Exit Criteria For Phase 0

1. `npm run rewrite:typecheck` passes.
2. Event inventory strict check passes with no missing protocol events.
3. Node version in CI is `23.x`.
4. Typed protocol decoding is used by rewrite app entrypoints.

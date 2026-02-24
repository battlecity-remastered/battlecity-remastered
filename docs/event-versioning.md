# Event Versioning Strategy (Parity Rewrite)

Last updated: 2026-02-24

## Objective
Avoid breaking client/server compatibility while visual parity fields are introduced or normalized.

## Rules
1. Do not change existing event names or required fields during parity rewrite.
2. Prefer additive fields only.
3. Treat all new fields as optional in decoders first.
4. Promote to required only after both server and client are updated and tested together.
5. Keep protocol schema and adapters in sync in the same commit.

## Compatibility modes
- `legacy-compatible`: existing payload only.
- `parity-extended`: existing payload + optional parity fields.

## Recommended rollout pattern
1. Add optional fields in `packages/protocol/src/events.ts`.
2. Update server emitters to include new fields.
3. Update client handlers to consume new fields when present and fallback when absent.
4. Add tests for both payload variants.
5. Only then tighten schema requirements if needed.

## Visual parity fields likely to need extension
- Building render hints (if server-sourced): overlay icon, smoke active/frame, itemsLeft.
- Defense visual hints: angle/orientation, damage state.
- Radar hints: role/classification override.

## Test requirements for any schema change
1. Protocol decode/encode tests pass.
2. Server tests for emitter payload shape pass.
3. Client event-router and network-event handling tests pass.
4. Full root check passes: `npm run rewrite:check:strict`.

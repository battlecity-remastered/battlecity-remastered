# Parity Acceptance Criteria

## Stage S0
- Required parity and event docs exist in this worktree.
- S-ID tracker is present and maintained with done/open/blocked/deferred states.

## Stage S1
- Server authoritative join/leave assignment and rejection semantics covered by tests.
- Runtime dispatch validates and handles authoritative lobby state transitions.
- Authoritative building placement/demolish gates (mayor/city/cost/research/collision/chain) emit explicit deny reasons.
- Authoritative house attachment and population growth/remove lifecycle emits `population.update` events and is test-covered.
- Inventory/item authority (collect/pickup/use/release) and hospital healing tick are server-driven and test-covered.
- Orb city reset flow emits explicit cleanup events for removed defenses/buildings/hazards.
- Bullet authority includes structure/hazard and blocking-tile terrain collision outcomes.
- Fake-city lifecycle and bot authority (defender/rogue spawn/move/fire/cooldown cleanup) are server-driven and test-covered.

## Stage S3
- Protocol has explicit canonical event naming and legacy alias compatibility strategy.
- Protocol explicitly covers `population.update` with `population:update` ingress compatibility.
- Server dispatch coverage for all implemented inbound authoritative request types is explicit and test-enforced.
- Client apply coverage for all implemented server->client gameplay event types is explicit and test-enforced.

## Stage S2
- Client state updates for key server events are complete and tested.
- Client applies authoritative `population.update` events and surfaces city population in HUD telemetry.
- Client includes lobby/chat runtime UI parity slices (assignment/denial/release + history/rate-limit/send semantics).
- Client includes help/map/options modal parity slices with explicit runtime toggle controls (`F1`/`F2`/`F3`).
- Client includes intro and tutorial runtime UX slices with explicit controls (`Enter`/`Escape` and `T`).
- Client includes runtime audio/music hooks with option-driven enable/disable behavior.
- Client includes build menu parity slice with selected-type hotkeys and pointer-tile ghost placement preview.
- Client world state applies authoritative building/bullet/icon/hazard/defense lifecycle events and visualizes core world objects.
- Client overlays and HUD use dirty-flag force-draw behavior to avoid unnecessary DOM/text churn.

## Stage S4
- Core runtime lifecycle uses Effect queue/scheduler/ref patterns.
- Runtime rejection and lifecycle behavior has typed, testable boundaries.
- Structured logging is available for runtime/client socket lifecycle and decode-failure paths.

## Stage S5
- Lint/typecheck/test/strict checks pass.
- CI parity gates run lint/typecheck/test/strict on both GitHub and GitLab pipelines.
- Parity status table has no silent skips: each S-ID is done/blocked/deferred with reason.
- New parity slices are accompanied by direct regression tests in the same subsystem checkpoint.

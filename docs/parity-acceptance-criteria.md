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

## Stage S3
- Protocol has explicit canonical event naming and legacy alias compatibility strategy.
- Protocol explicitly covers `population.update` with `population:update` ingress compatibility.
- Contract behavior is tested at decode/dispatch/apply boundaries.

## Stage S2
- Client state updates for key server events are complete and tested.
- Client applies authoritative `population.update` events and surfaces city population in HUD telemetry.
- UI parity restoration tracked and tested subsystem-by-subsystem.
- Client world state applies authoritative building/bullet/icon lifecycle events and visualizes core world objects.

## Stage S4
- Core runtime lifecycle uses Effect queue/scheduler/ref patterns.
- Runtime rejection and lifecycle behavior has typed, testable boundaries.

## Stage S5
- Lint/typecheck/test/strict checks pass.
- Parity status table has no silent skips: each S-ID is done/blocked/deferred with reason.

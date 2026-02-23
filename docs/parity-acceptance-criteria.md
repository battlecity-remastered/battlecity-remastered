# Parity Acceptance Criteria

## Stage S0
- Required parity and event docs exist in this worktree.
- S-ID tracker is present and maintained with done/open/blocked/deferred states.

## Stage S1
- Server authoritative join/leave assignment and rejection semantics covered by tests.
- Runtime dispatch validates and handles authoritative lobby state transitions.

## Stage S3
- Protocol has explicit canonical event naming and legacy alias compatibility strategy.
- Contract behavior is tested at decode/dispatch/apply boundaries.

## Stage S2
- Client state updates for key server events are complete and tested.
- UI parity restoration tracked and tested subsystem-by-subsystem.

## Stage S4
- Core runtime lifecycle uses Effect queue/scheduler/ref patterns.
- Runtime rejection and lifecycle behavior has typed, testable boundaries.

## Stage S5
- Lint/typecheck/test/strict checks pass.
- Parity status table has no silent skips: each S-ID is done/blocked/deferred with reason.

# Parity Acceptance Criteria

## Stage S0
- Required parity and event docs exist in-worktree and are updated per checkpoint.
- S-ID tracker has explicit status for every mapped item.

## Stage S1
- Server authoritative join/leave assignment and rejection semantics are test-covered.
- Building/research/economy/factory/inventory/hazard/defense/orb/score/chat/fake-city/bot/map systems are authoritative and tested.
- Security validation and typed rejection semantics are wired through runtime dispatch.

## Stage S3
- Protocol canonical naming and legacy alias compatibility are explicit and documented.
- Dispatch/apply coverage for implemented request/event inventory is regression-enforced.
- Compatibility strategy (`:` ingress aliases, `.` canonical egress) is enforced by shared protocol adapters.

## Stage S2
- Client state updates for implemented server events are complete and tested.
- Lobby assignment must restore city spawn-aligned local camera position before movement/build intents are emitted.
- Inventory icon select/arm/drop semantics are wired through runtime controls.
- Layered world rendering parity slices are active: ground/tile/changing/object/effects/debug/labels.
- Terrain/map parity includes command-center map-square rendering and blocking-footprint behavior.
- Identity/map/build/tutorial/options/help/chat/lobby/intro/audio window UX slices are runtime wired and tested.
- Asset manifest and client map parity loader are active in the render/runtime path.

## Stage S4
- Core runtime lifecycle uses Effect queue/scheduler/ref patterns.
- Runtime rejection and lifecycle behavior use typed boundaries.
- Structured logging is active for runtime/client socket lifecycle and decode-failure paths.

## Stage S5
- Lint/typecheck/test/strict checks pass.
- CI parity gates run lint/typecheck/test/strict on GitHub and GitLab.
- Benchmark/serialization parity coverage exists in protocol/server/client test suites.
- Behavior parity scenarios are encoded as automated runtime tests.
- Every S-ID has explicit status (done/blocked/deferred) with no silent skips.

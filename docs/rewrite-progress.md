# Rewrite Progress

## Current Stage
- `S5` final closure checkpoint: parity docs normalized, staged ledger closed (`done` across `S0..S5`), and strict validation reconfirmed on `2026-02-23` against current HEAD at validation time.

## S-ID Status Ledger
| S-ID | Status | Notes |
|---|---|---|
| S0-01 | done | Contract inventory maintained in gap docs/checklist |
| S0-02 | done | Event parity matrix maintained with canonical/legacy mappings |
| S0-03 | done | Acceptance criteria retained and stage-gated |
| S1-01..S1-26 | done | Authoritative lobby/economy/research/buildings/factories/hazards/defense/orb/score/security/fake-city/bots/map/adapters implemented and regression-covered |
| S3-01 | done | Protocol schemas cover implemented gameplay/runtime contract |
| S3-02 | done | `:` ingress aliases normalized centrally with canonical `.` egress |
| S3-03 | done | Server dispatch inventory explicit and test-locked |
| S3-04 | done | Client apply inventory explicit and test-locked |
| S3-05 | done | Versioning/compatibility strategy documented and current |
| S2-01..S2-04 | done | Typed ingress/apply, movement+collision, and build/demolish parity slices active |
| S2-05 | done | Client inventory icon selection/arming/drop semantics landed in `IconInventoryService` + intent wiring |
| S2-06 | done | Client item/hazard lifecycle visuals and application parity active |
| S2-07..S2-09 | done | Bullet lifecycle, HUD telemetry, build menu + ghost placement parity active |
| S2-10 | done | Item renderer enforces priority ordering and hidden enemy mine visibility rules |
| S2-11 | done | Ground/tile/changing layer rendering modules integrated in scene runtime |
| S2-12 | done | Name-label renderer parity slice active with rank/callsign/city formatting |
| S2-13 | done | Muzzle flash + camera shake + event FX renderer integrated |
| S2-14 | done | Client map orientation loader and city-layout snapshot parity slices active |
| S2-15..S2-17 | done | Keyboard/mouse/lobby UX parity slices active |
| S2-18 | done | Identity UX manager with local/google mode toggle + persisted callsign/user binding active |
| S2-19..S2-24 | done | Chat/help/map/options/tutorial/intro parity slices active |
| S2-25 | done | Rogue client parity slice via hostile summary telemetry and HUD integration |
| S2-26 | done | Defender debug/pathing parity slice via bot debug overlay + summaries |
| S2-27..S2-29 | done | Audio/window/dirty-flag parity slices active |
| S2-30 | done | Asset manifest + client `map.dat` parity asset baseline added |
| S4-01..S4-08 | done | Layer composition, typed errors, ingress queue, scheduler, refs, observability, scopes, adapters all active |
| S5-01..S5-06 | done | Server parity suites cover building/research/hazard/orb/lobby/inventory/security authority paths |
| S5-07 | done | Client/sim-core movement collision parity tests active |
| S5-08 | done | Item/bullet/build-menu/ghost/intents parity tests active |
| S5-09 | done | Client UI/router/modal parity tests active |
| S5-10 | done | Benchmark/serialization parity smoke suites added in protocol/server/client tests |
| S5-11 | done | Behavior parity scenarios added (`behavior-parity.test.ts`) |
| S5-12 | done | CI parity gates include lint/typecheck/test/strict |

## Exact Files Changed In This Delivery
- `apps/client-ts/src/gameplay/world-viewport.ts`
- `apps/client-ts/src/app/state.ts`
- `apps/client-ts/src/app/intents-actions.ts`
- `apps/client-ts/src/gameplay/collision/collision-helpers.ts`
- `apps/client-ts/src/ui/build-menu/GhostPlacement.ts`
- `apps/client-ts/src/input/mouse-input.ts`
- `apps/client-ts/src/render/layers/GroundLayer.ts`
- `apps/client-ts/src/render/layers/TileLayer.ts`
- `apps/client-ts/src/render/panel/panel-visuals.ts`
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/src/world/map-loader.ts`
- `apps/client-ts/test/world-viewport.test.ts`
- `apps/client-ts/test/mouse-input.test.ts`
- `apps/client-ts/test/panel-visuals.test.ts`
- `apps/client-ts/test/ghost-placement.test.ts`
- `apps/client-ts/test/item-bullet-intents.test.ts`
- `apps/client-ts/test/player-movement.test.ts`
- `apps/client-ts/test/map-loader.test.ts`
- `docs/main-branch-parity-gap-audit.md`
- `docs/typescript-gap-analysis.md`
- `docs/typescript-gap-mapping.md`
- `docs/rewrite-progress.md`

## Validation Results
- `npm run lint`: pass (2026-02-24)
- `npm run typecheck`: pass (2026-02-24)
- `npm run test`: pass (2026-02-24, `163/163`)
- `npm run typecheck --workspace @battlecity/client-ts`: pass (2026-02-24, camera/terrain/input/build parity slice)
- `npm run test --workspace @battlecity/client-ts`: pass (2026-02-24, `85/85`)
- `npm run rewrite:check:strict`: **fail** (2026-02-24) at `rewrite:complexity:strict`; blocker is pre-existing strict complexity threshold breaches in existing files (`apps/client-ts/src/render/scene.ts` complexity 26, `apps/client-ts/src/ui/options/OptionsModal.ts` complexity 24, `apps/client-ts/src/render/effects/EffectsRenderer.ts` complexity 20).

## Checkpoint: 2026-02-24 (Visual/Movement/Build Parity Bugfix)

### Stage Focus
- `S2` parity hardening against live regressions reported from side-by-side legacy comparison:
  - wrong default build type and build-menu hotkeys,
  - missing city-spawn camera alignment on lobby assignment,
  - non-legacy panel width/viewport math drift,
  - command-center terrain draw and blocking parity drift,
  - ground tiling scale drift from legacy.

### S-ID Status Updates
| S-ID | Status | Notes |
|---|---|---|
| S2-02 | done | Movement feel improved by restoring 33ms client tick cadence and assignment-spawn alignment |
| S2-08 | done | Side panel viewport contract re-aligned to legacy 200px width |
| S2-09 | done | Build defaults/hotkeys now select legacy-valid housing/research chain entry points |
| S2-11 | done | Ground and tile rendering corrected for legacy texture scale + command-center map-square rendering |
| S2-14 | done | Map blocking tiles now include command-center footprint semantics |
| S2-16 | done | Panel hotspot hit-testing re-verified against adjusted panel-width geometry |

### Exact Files Changed (this checkpoint)
- `apps/client-ts/src/app/loop.ts`
- `apps/client-ts/src/app/network-events.ts`
- `apps/client-ts/src/app/state.ts`
- `apps/client-ts/src/gameplay/world-viewport.ts`
- `apps/client-ts/src/render/layers/GroundLayer.ts`
- `apps/client-ts/src/render/layers/TileLayer.ts`
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/src/ui/build-menu/BuildMenu.ts`
- `apps/client-ts/src/world/map-loader.ts`
- `apps/client-ts/src/world/city-spawn.ts`
- `apps/client-ts/test/build-menu.test.ts`
- `apps/client-ts/test/city-spawn.test.ts`
- `apps/client-ts/test/item-bullet-intents.test.ts`
- `apps/client-ts/test/map-loader.test.ts`
- `apps/client-ts/test/mouse-input.test.ts`
- `apps/client-ts/test/network-events.test.ts`
- `apps/client-ts/test/world-viewport.test.ts`

### Validation (this checkpoint)
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run test`: pass (`166/166`)
- `npm run rewrite:check:strict`: **fail** at `rewrite:complexity:strict` due pre-existing complexity ceilings in:
  - `apps/client-ts/src/render/scene.ts` (26)
  - `apps/client-ts/src/ui/options/OptionsModal.ts` (24)
  - `apps/client-ts/src/render/effects/EffectsRenderer.ts` (20)

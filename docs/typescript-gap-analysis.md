# TypeScript Rewrite Gap Analysis (`master` vs `feature/typescript`)

## Baseline
- Date: 2026-02-23
- Requested baseline branch: `main` (not present in repo)
- Baseline actually analyzed: `master` (`b104bfc1b41453b819bad2ace76754a4cfe6049c`)
- Target branch analyzed: `feature/typescript` (`06db060df2937071c5aff4e24c0b77d6794ce656`)

## Scope and Goal
This report focuses on functional parity gaps that must be fixed so the TypeScript rewrite can fully replace the legacy JS game, with emphasis on:
- Core game logic parity
- Full UI/UX parity
- Proper Effect-based architecture (not just wrappers)

## Executive Summary
The current `feature/typescript` branch is a foundational prototype, not a parity rewrite yet.

Key delta indicators:
- Runtime code size dropped from `~37,477` lines (`master` `client/src` + `server/src`) to `~1,342` lines (`apps/client-ts/src` + `apps/server-ts/src`).
- Gameplay runtime modules dropped from `92` files to `20` files.
- Legacy integration/unit/behavior tests (`client/test` + `server/test` + `features`) dropped from `77` files to `6` files in TS workspaces.
- Legacy socket event surface actively used in runtime: `71` events.
- TS runtime currently uses `12` events in code paths.
- TS server dispatch handlers: `5` event types.
- TS client network event handlers: `5` event types.

Conclusion: the branch currently implements a minimal movement/shoot/build loop with basic snapshots and a minimal HUD scene. Most gameplay systems and almost all product UX are missing.

## Measured Coverage Snapshot

| Area | `master` | `feature/typescript` | Gap |
|---|---:|---:|---:|
| Runtime source files | 92 | 20 | -72 |
| Runtime LOC | ~37,477 | ~1,342 | -36,135 |
| Test files | 77 | 6 | -71 |
| Socket events used by runtime | 71 | 12 | -59 |
| Server event handlers | many (factory-based) | 5 | severe |
| Client event handlers | many (SocketListener) | 5 | severe |

## Domain Gap Matrix

| Domain | Legacy (`master`) | TS branch status | Severity |
|---|---|---|---|
| Connection + lobby + roles | Mayor/recruit assignment constraints, lobby snapshots/refresh/eviction flows | Minimal `lobby.join.request` -> `lobby.assignment`; no full lobby UX flows | Critical |
| Identity/auth/account | Google identity, registration, user persistence, rank metadata | Not implemented | Critical |
| Movement/collision | Tile-aware collision, terrain/building collisions, safe-position recovery, map constraints | Basic movement only via `advancePlayer`; no terrain/building collision parity | Critical |
| Bullet/combat model | Multiple bullet types, hazard/building footprint handling, richer damage/physics behavior | Simplified bullet stepping and hit checks; no parity for legacy collision semantics | Critical |
| Building placement rules | Economy checks, adjacency/chain rules, role permissions, canBuild progression, research gates | Only city match + placement/demolish with owner check | Critical |
| Economy/finance | City budgets, income/expenses tick, money UI, upkeep/cost systems | Not implemented | Critical |
| Research/build tree | Full research dependency tree and production gating | Not implemented | Critical |
| Factories/item production | Factory stock, output caps, collect/purge, inventory sync, shared drops | Not implemented | Critical |
| Items/hazards/defenses | Bomb/mine/DFG/orb workflows, turret/sleeper/plasma/wall behaviors | Not implemented | Critical |
| Orb/city destruction/scoring | Orbable rules, city wipe/reset, score/orb bounty/rank progression | Not implemented | Critical |
| Fake cities + bots | Fake city lifecycle, defender/rogue bots, pathfinding/navmask behavior | Implemented for authoritative gameplay parity: fake-city activation/cooldown, defender/rogue bot spawn-move-fire-cleanup, and client debug overlays are active and regression-covered | Low |
| Map + assets | `map.dat` loading/orientation, sprite sheets, UI art/audio | Removed from runtime path; no TS asset pipeline parity | Critical |
| UI shell + overlays | Lobby UI, build interface, panel finance/inventory, radar, modals, chat, options, tutorial | Replaced by minimal canvas scene + text HUD only | Critical |
| Audio | Music/SFX managers and trigger points | Not implemented | High |
| Notifications/integration | Discord notifier, join/orb announcements | Not implemented | Medium |
| Security validation | Movement/build/bullet validation rules and anti-cheat checks | Minimal request validation only | High |

## What Is Implemented in TS Today
- Protocol envelope + schema decode path exists.
- Basic state replication for players.
- Basic local movement loop and heading updates.
- Basic bullet spawn/tick/hit resolution.
- Basic building place/demolish commands.
- Minimal Pixi render scene (local + remote rectangles, text HUD).
- Basic tests for protocol envelope/sim-core/game runtime/entity cache.

## Effect.ts Architecture Gap (Important)
Current Effect usage is mostly imperative wrappers (`Effect.sync`/`Effect.runSync`) around mutable code. This does not yet represent an Effect-centric architecture.

Missing for true Effect rewrite standard:
- Layered service architecture (`Layer`) for runtime services (players, buildings, inventory, economy, chat, identity).
- Typed domain errors propagated via `Effect` instead of ad-hoc string rejects.
- Managed ticking/scheduling (`Schedule`, `Clock`) for deterministic simulation loops.
- Event ingestion pipelines with backpressure/queues (`Queue`, `Stream`, or equivalent controlled ingestion).
- Structured state management (`Ref`/`SynchronizedRef`) replacing shared mutable maps as direct global mutation surfaces.
- Integration of schema decode/encode and command handling as effectful programs with composable observability/retries.
- Fiber-safe boundaries for networking and lifecycle management.

## Detailed Missing Capability Inventory

### Core gameplay logic not yet parity-complete
- Terrain/building collision resolution parity.
- Building footprint/bay rules parity.
- Inventory system and item usage logic parity.
- Research unlock and production gating.
- Economy ticks and spending/refund rules.
- Orb destruction lifecycle and city reset rules.
- Defender/rogue/fake-city AI gameplay loops.
- Hazard lifecycle logic (bomb timers, mine triggers, DFG freeze, turret fire logic).

### UI/UX not yet parity-complete
- Lobby manager and assignment UI.
- Build menu and build dependency visual affordances.
- Demolish mode UX and cursor behavior.
- Side panel (finance/population/research/inventory) and force-draw behavior.
- Radar/minimap rendering and cloak-aware visibility.
- Name labels with rank/callsign/city formatting.
- Map modal/help/options/tutorial/chat overlays.
- Notification/toast systems.
- Audio/SFX hooks tied to gameplay events.

## Staged Remediation Plan

## Stage 0: Contract and parity freeze
Goal: lock authoritative parity target before additional implementation.

Deliverables:
- Freeze canonical legacy behavior checklist from `master` (derive from `GameRules.md` + tests).
- Freeze full runtime event contract for all gameplay-relevant events.
- Define explicit parity acceptance criteria per subsystem.

Exit criteria:
- Signed-off parity checklist with owner per subsystem.
- Event contract doc with schema status (`implemented`, `stubbed`, `missing`).

## Stage 1: Server authoritative gameplay parity (TS + Effect)
Goal: rebuild full server gameplay behavior in `apps/server-ts` with Effect-first domain services.

Deliverables:
- Player/city/role lifecycle parity.
- Economy/research/buildings/factories/hazards/orb/scoring parity.
- Security validation parity.
- Fake cities + bot integration parity.
- Persistence/identity/notification adapters.

Exit criteria:
- Legacy server test scenarios ported and passing in TS equivalent suites.
- Command handler rejection semantics match parity spec.

## Stage 2: Client gameplay and rendering parity (TS + Effect-aware boundaries)
Goal: restore complete gameplay interaction and rendering behavior in `apps/client-ts`.

Deliverables:
- Full input semantics (all keybinds/interactions).
- Tile/map/collision behavior parity.
- Bullet/item/hazard/building draw/update parity.
- Sprite/audio asset pipeline parity.

Exit criteria:
- Gameplay parity scenarios run end-to-end against TS server.
- Visual correctness checklist passes for major interactions.

## Stage 3: UX/UI parity restoration
Goal: bring back complete product UI/UX.

Deliverables:
- Lobby, panel, radar, chat, map/help/options/tutorial modals.
- Finance/inventory/research UI state sync correctness.
- Notification and interaction affordance parity.

Exit criteria:
- UX parity checklist signed off.
- No critical UX regressions in manual parity QA pass.

## Stage 4: Effect architecture hardening
Goal: ensure rewrite is genuinely Effect-native, maintainable, and testable.

Deliverables:
- Service layers and typed errors across server/client domain boundaries.
- Deterministic effectful simulation orchestration.
- Structured observability and failure handling paths.

Exit criteria:
- Architecture review passes with explicit Effect patterns in core services.
- No critical mutable-global shortcuts left in core domain flows.

## Stage 5: Parity validation and release readiness
Goal: prove replacement readiness.

Deliverables:
- Ported and expanded parity test matrix (unit + integration + behavior).
- Load/stability/security smoke passes.
- Migration/cutover runbook.

Exit criteria:
- Critical parity gaps closed.
- Core game loop + UX/UI validated as functionally equivalent for production use.

## Priority Fix Queue (Immediate)
1. Expand event schemas/handlers from current minimal subset to full gameplay contract.
2. Rebuild server authoritative systems: economy, research, factories, hazards, orb, scoring.
3. Restore full UI shell and panel/radar/inventory/build UX.
4. Reintroduce map/assets/audio pipelines.
5. Port legacy regression and behavior tests to TS parity suites.
6. Refactor runtime services to true Effect architecture (Layer + typed errors + managed loops).

## Definition of Done for this rewrite
The rewrite should only be considered complete when:
- Core gameplay logic matches legacy behavior under automated parity tests.
- All intended UI/UX flows work equivalently (including edge cases and accessibility of controls).
- Effect is used as the primary runtime architecture pattern for domain composition, error typing, and lifecycle control.
- No critical regressions remain in multiplayer sync, economy, build systems, combat systems, or lobby flows.


## Implementation Status Update (2026-02-23, final checkpoint)
- Stage execution order completed: `S0 -> S1 -> S3 -> S2 -> S4 -> S5`.
- All meaningful parity gaps tracked in this rewrite were closed and documented across S0-S5.
- Server-authoritative gameplay parity is restored for lobby, economy, research, buildings, factories, hazards, defenses, orb/scoring, security, fake cities, bots, map loading, and notifier adapters.
- Client gameplay/UI parity slices are restored for input, movement/collision, bullets/items/hazards/build flows, lobby/chat/identity/modals/tutorial/intro, layered rendering/effects/debug overlays, audio hooks, window mode, dirty-flag rendering, and baseline parity assets.
- Protocol coverage, dispatch/apply inventories, and compatibility behavior (`:` ingress aliases, `.` canonical egress) are explicit and regression-enforced.
- Runtime architecture is Effect-native in core composition (`Layer`, typed error mapping, ingress queue, deterministic scheduler, `Ref` state, scoped lifecycle, observability).
- Validation gates at this checkpoint: `lint`, `typecheck`, `test`, and `rewrite:check:strict` all pass.
- Validation reconfirmed on current HEAD at validation time with the same gate set passing.

## Remaining Risks (Non-critical)
- High-fidelity visual/audio asset-pack parity remains a polish track beyond functional parity closure.
- Optional legacy third-party telemetry/integration events remain out-of-scope for current authoritative gameplay parity.

## Post-Checkpoint Update (2026-02-24)
- Client visual parity slices continued beyond the final checkpoint:
  - textured side-panel button chrome landed from legacy assets.
  - lobby overlay now supports assignment/score views with city filtering controls.
  - lobby overlay now renders explicit tab-state labels for assignment vs score view parity.
  - options modal now includes operational city-import execution from legacy `.city` files.
  - lobby/options overlays now use legacy interface texture backdrops for improved visual parity.
  - notification/toast overlay is event-driven for promotion/denial/orb flows.
  - notification panel now includes explicit in-game menu affordance lines (F1/F2/F3/F4 controls).
  - orb hint and notification overlays now share legacy-texture visual chrome.
  - mouse interaction now drives cursor-mode cues for build/demolish/bomb states.
- These are additive parity improvements on top of the already-closed S-ID matrix.

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
| Fake cities + bots | Fake city lifecycle, defender/rogue bots, pathfinding/navmask behavior | Not implemented | High |
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

## Implementation Status Update (2026-02-23)
- Completed now:
  - S0 contract docs and parity tracking artifacts created in-worktree.
  - S1 lobby authority slice: mayor/recruit assignment, overflow denial, leave/release lifecycle.
  - S1 authoritative system slices: security validator, economy tick, research lifecycle, factory stock cycle, hazard detonation, orb city-reset + score promotion, chat history/rate-limit.
  - S1 building authority slice: mayor-only build/demolish authority, spend-based build budget, research gate validation, placement collision/chain validation, explicit deny feedback events.
  - S1 inventory/health authority slice: per-player inventory caps + release, icon pickup authority, medkit item-use healing, hospital healing tick.
  - S1 movement safety slice: world clamp and spawn-safe relocation around building footprints.
  - S3 compatibility strategy implemented: canonical dot emit, colon alias ingress normalization, and expanded event schemas/dispatch/apply for new subsystem events.
  - S2 partial client parity slices: extended keyboard semantics, expanded event apply store (including hazard + inventory updates), finance/research/factory/hazard/chat + medkit HUD data exposure.
  - S4 runtime infrastructure slice: Effect queue ingress, Effect tick scheduler, runtime scope lifecycle, runtime Layer bootstrap, typed rejection ADT mapping.
  - S4 architecture hardening slice: Effect-based runtime/client logging primitives and adapter scaffolding for persistence/notifications.
  - Additional S1 authority slice: identity/profile binding on join and score profile hydration/update on orb awards.
  - Additional S1 authority slice: defense deploy authority, defense damage/update/remove lifecycle, and city-orbed defense cleanup.
  - Additional S1 authority slice: defense placement occupancy parity tightened (3x3 building footprint blocking with hospital/factory exceptions, hazard tile occupancy blocking).
  - Additional S1 adapter slice: orb victory notification adapter invoked from authoritative orb flow.
  - Additional S1 adapter slice: notifier invocation path now covered by runtime assertion tests.
  - S3 contract slice: `score.profile` and `defense.*` schemas + legacy alias mapping coverage.
  - S3 compatibility slice: added ingress alias normalization for `defense:deploy` and `defense:update`.
  - Additional S1/S3 combat slice: bullets now resolve against live hazards with authoritative `hazard.remove` cleanup and `bullet.resolved` payload support for `hit_hazard`.
  - Additional S1/S3 combat slice: bullets now resolve against authoritative runtime blocking tiles with explicit `bullet.resolved` reason `hit_terrain`.
  - Additional S1/S3 orb slice: city orb cleanup now emits explicit `building.demolished` and `hazard.remove` (`city_orbed`) events for removed target-city entities.
  - S2 client slice: profile + defense event application and HUD visibility parity.
  - S2 client slice: building placed/demolished application and primitive world rendering for buildings/defenses/hazards.
  - S2/S3 client+protocol slice: bullet fired/resolved and icon pickup confirmation now apply into client state, bullets now render in world layer, and HUD surfaces bullet + last pickup telemetry.
  - Additional S1 authority slice: house attachment and population tick/remove lifecycle parity via `PopulationService` with authoritative `population.update` emission.
  - Additional S3 contract slice: canonical `population.update` schema with legacy `population:update` ingress normalization coverage.
  - Additional S2 client slice: `population.update` state application plus HUD city-population telemetry from authoritative server updates.
  - S3 compatibility slice: added ingress alias normalization for `inventory:update`.
  - S3 compatibility slice: added ingress alias normalization for `bullet:fired`, `bullet:resolved`, `new_building`, and `demolish_building`.
  - S5 parity tests expanded for identity/profile + defense authority + bullet-hazard collision authority in server/client/protocol/sim-core suites.
  - S5 parity tests expanded for terrain-tile bullet collision and orb cleanup emission for building/hazard removal.
  - S5 parity tests expanded to assert orb notifier adapter invocation payloads.
  - S5 parity tests expanded for defense placement occupancy semantics and defense alias decode coverage.
  - S5 parity tests expanded for bullet lifecycle state application and icon pickup confirmation application in client network event suites, plus protocol alias decode coverage for legacy bullet/build aliases.
  - S5 parity tests expanded for population attachment growth/cleanup authority and client/protocol population event handling.
  - S5 parity slice coverage expanded in server/client/protocol tests; strict quality gates passing.
  - Additional S1/S3 authority slice: team chat delivery is now city-scoped, global chat remains broadcast, and join-time chat history is filtered by visibility scope.
  - Additional S5 parity slice: runtime chat tests now assert team/global routing semantics plus join-time history filtering.
  - Additional S4 maintainability slice: dispatch helper extraction (`dispatch-support.ts`) keeps strict file-size gate green while preserving handler behavior.
  - Additional S2/S3 client ingress slice: typed network router (`decodeServerEnvelope`) now centralizes alias normalization + schema decode before event application, with explicit malformed-envelope regression tests.
  - Additional S2 keyboard parity slice: client key aliases now include `S/Down`, `E`, `O`, `H`, and `Delete` while preserving prior request intents.
  - Additional S2 mouse parity slice: client now wires mouse left/right controls, context-menu suppression, and resize-time interaction hit-area synchronization via `registerMouseInputHandlers`.
  - Additional S2 window parity slice: `WindowModeService` now applies renderer resize synchronization and double-click fullscreen toggling with explicit runtime teardown.
  - Additional S1/S4 adapter slice: orb notifier now resolves canonical runtime user identity and uses an Effect-based Discord webhook transport when configured.
  - Additional S5 parity slice: notifier adapter behavior, router decode/canonicalization paths, mouse input semantics, and window mode behaviors now have dedicated tests.
  - Additional S1 authority slice: legacy map and city layout loaders are now ported into TS (`MapService`, `CityLayoutService`) with canonical `map.dat` and city spawn/layout assets in `apps/server-ts/data/*`.
  - Additional S1/S5 combat slice: terrain collision parity is now map-loader-fed end-to-end, and dedicated tests validate map decode orientation, blocking-tile extraction, city layout parsing, and runtime hydration.
- Still open/deferred:
  - Identity/persistence/rank hydration integrations.
  - Full legacy build-tree, inventory icon, defense, fake-city, and bot parity.
  - Full client UI/UX module parity (lobby/chat modals/tutorial/options/radar/audio).

# TypeScript Rewrite Gap-to-File Mapping (`master` -> `feature/typescript`)

## Scope
This document maps each major parity gap to:
- concrete legacy implementation anchors (`master` files/functions)
- proposed TypeScript destination files/modules (existing or new)
- staged delivery order

Baseline refs:
- `master`: `b104bfc1b41453b819bad2ace76754a4cfe6049c`
- `feature/typescript`: `06db060df2937071c5aff4e24c0b77d6794ce656`

Legend:
- `exists`: TS file/module already exists and should be extended
- `new`: proposed TS file/module to add

## Stage 0: Contract + Parity Baseline

| Gap ID | Legacy anchors (`master`) | TS target files/modules | Status |
|---|---|---|---|
| S0-01 Full gameplay contract inventory | `GameRules.md`; `AGENTS.md`; `client/src/SocketListener.js`; `server/src/*Factory.js` | `docs/typescript-gap-analysis.md` (exists), `docs/typescript-gap-mapping.md` (exists), `docs/parity-checklist.md` (new) | done |
| S0-02 Event parity matrix (71 runtime events) | `client/src/SocketListener.js::listen`; `server/src/*::listen` | `packages/protocol/src/events.ts` (exists), `packages/protocol/src/envelope.ts` (exists), `docs/event-parity-matrix.md` (new) | done |
| S0-03 Branch acceptance criteria by subsystem | `server/test/*`; `client/test/*`; `features/*` | `docs/parity-acceptance-criteria.md` (new) | done |

## Stage 1: Server Authoritative Gameplay Parity (TS + Effect)

| Gap ID | Legacy anchors (`master`) | TS target files/modules | Status |
|---|---|---|---|
| S1-01 City slot assignment, mayor/recruit constraints, overflow denial | `server/src/PlayerFactory.js::assignCityAndRole`; `emitLobbySnapshot`; `lobby:denied` flow | `apps/server-ts/src/runtime/dispatch.ts` (exists), `apps/server-ts/src/domain/lobby/LobbyService.ts` (new), `apps/server-ts/src/domain/lobby/LobbySnapshot.ts` (new) | done |
| S1-02 Enter/leave/evict/release lobby lifecycle | `server/src/PlayerFactory.js::listen`; `lobby:released`; `lobby:evicted` | `apps/server-ts/src/domain/lobby/LobbyService.ts` (new), `apps/server-ts/src/runtime/GameRuntime.ts` (exists) | done |
| S1-03 Identity + profile binding at join | `server/src/PlayerFactory.js::resolveIdentityFromPayload`; `server/src/users/UserStore.js::*` | `apps/server-ts/src/domain/identity/IdentityService.ts` (new), `apps/server-ts/src/adapters/persistence/UserStoreAdapter.ts` (new) | done |
| S1-04 Rank/points profile hydration and broadcasts | `server/src/users/ScoreService.js::resolveRank/getProfile/updateUser/recordOrbVictory/recordDeath`; `PlayerFactory.updatePlayerScores` | `apps/server-ts/src/domain/score/ScoreService.ts` (new), `apps/server-ts/src/runtime/player-runtime.ts` (exists) | done |
| S1-05 Movement anti-cheat/validation pipeline | `server/src/validation/PlayerStateValidator.js::validatePlayerUpdate`; `PlayerFactory.handlePlayerUpdate` | `apps/server-ts/src/domain/security/PlayerUpdateValidator.ts` (new), `apps/server-ts/src/runtime/dispatch.ts` (exists) | done |
| S1-06 World collision clamp + spawn-safe relocation | `server/src/PlayerFactory.js::ensureSpawnIsClear/enforceWorldMovement/resolvePlacementForPlayer` | `apps/server-ts/src/domain/spawn/SpawnService.ts` (new), `apps/server-ts/src/domain/world/CollisionService.ts` (new) | done |
| S1-07 Hospital healing tick parity | `server/src/PlayerFactory.js::applyHospitalHealingForPlayer` | `apps/server-ts/src/domain/health/HealingService.ts` (new), `apps/server-ts/src/runtime/GameRuntime.ts` (exists) | done |
| S1-08 Medkit item-use authoritative handling | `server/src/PlayerFactory.js::item:use medkit handlers`; `server/src/items.js` | `apps/server-ts/src/domain/items/ItemUseService.ts` (new), `apps/server-ts/src/domain/inventory/InventoryService.ts` (new) | done |
| S1-09 Building placement permissions, adjacency, costs | `server/src/BuildingFactory.js::handleNewBuilding/getCityCanBuild/searchTree`; `CityManager.recordBuildingCost` | `apps/server-ts/src/runtime/building-runtime.ts` (exists), `apps/server-ts/src/domain/buildings/BuildingRulesService.ts` (new) | done |
| S1-10 Demolish deny reasons + authoritative feedback | `server/src/BuildingFactory.js::handleDemolish/emitDemolishDenied` | `apps/server-ts/src/runtime/building-runtime.ts` (exists), `apps/server-ts/src/domain/buildings/DemolishService.ts` (new) | done |
| S1-11 Research lifecycle and dependency tree gating | `server/src/BuildingFactory.js::startResearch/completeResearch/applyResearchState/getRequiredResearchType` | `apps/server-ts/src/domain/research/ResearchService.ts` (new), `packages/protocol/src/events.ts` (exists) | done |
| S1-12 House attachment/population model parity | `server/src/BuildingFactory.js::applyPopulationUpdate/attachment methods`; `server/src/Building.js` | `apps/server-ts/src/domain/population/PopulationService.ts` (new), `apps/server-ts/src/domain/buildings/BuildingState.ts` (new) | done |
| S1-13 Economy income/spend cycle parity | `server/src/CityManager.js::cycle/addIncome/spendForResearch/spendForHospital/trySpendForFactory` | `apps/server-ts/src/domain/economy/CityEconomyService.ts` (new), `apps/server-ts/src/runtime/GameRuntime.ts` (exists) | done |
| S1-14 Inventory caps and stock release semantics | `server/src/CityManager.js::recordInventoryPickup/recordInventoryConsumption/releasePlayerInventory` | `apps/server-ts/src/domain/inventory/InventoryService.ts` (new) | done |
| S1-15 Factory production cycle and item stock accounting | `server/src/FactoryBuilding.js::cycle`; `BuildingFactory.handleFactoryCollect/registerFactoryIcon/cycle` | `apps/server-ts/src/domain/factories/FactoryService.ts` (new) | done |
| S1-16 Icon drop authoritative collect/pickup flows | `server/src/IconDropManager.js::handleDrop/handlePickup/decrementFactoryStock` | `apps/server-ts/src/domain/icons/IconDropService.ts` (new), `apps/server-ts/src/runtime/dispatch.ts` (exists) | done |
| S1-17 Hazard lifecycle (mine/bomb/DFG), area damage, cleanup | `server/src/hazards/HazardManager.js::updateMine/updateBomb/detonateBomb/damagePlayersInRadius/updateDFG` | `apps/server-ts/src/domain/hazards/HazardService.ts` (new) | done |
| S1-18 Defense placement/damage/replenishment parity | `server/src/DefenseManager.js::handleSpawn/applyDefenseDamage/removeDefensesByType` | `apps/server-ts/src/domain/defense/DefenseService.ts` (new) | done |
| S1-19 Orb drop validation + city wipe/reset | `server/src/orb/OrbManager.js::handleDrop/resolveTargetCity`; `CityManager.resetCity`; `PlayerFactory` eviction interactions | `apps/server-ts/src/domain/orb/OrbService.ts` (new) | done |
| S1-20 Score/rank updates + promotion events | `server/src/users/ScoreService.js::resolveRank/recordOrbVictory/recordDeath`; `score:promotion` event path | `apps/server-ts/src/domain/orb/OrbService.ts` (new), `packages/protocol/src/events.ts` (exists) | done |
| S1-21 Chat + history + rate-limit parity | `server/src/chat/ChatManager.js::handleChatMessage/sendHistoryForSocket/isRateLimited` | `apps/server-ts/src/domain/chat/ChatService.ts` (new), `apps/server-ts/src/runtime/dispatch.ts` (exists) | done |
| S1-22 Fake city lifecycle and cooldown orchestration | `server/src/FakeCityManager.js::update/onCityOrbed/setCityCooldown` | `apps/server-ts/src/domain/fake-cities/FakeCityService.ts` (new) | done |
| S1-23 Defender/rogue bot behaviors and targeting | `server/src/bots/DefenderBotManager.js::*`; `server/src/bots/RogueBotManager.js::*` | `apps/server-ts/src/domain/bots/DefenderBotService.ts` (new), `apps/server-ts/src/domain/bots/RogueBotService.ts` (new) | done |
| S1-24 Map and city layout loaders | `server/src/CityFileLoader.js`; `server/src/cityLayoutImporter.js`; `server/src/utils/mapLoader.js` | `apps/server-ts/src/domain/map/CityLayoutService.ts` (new), `apps/server-ts/src/domain/map/MapService.ts` (new), `apps/server-ts/data/*` (new) | done |
| S1-25 Bullet terrain/structure/hazard collision parity | `server/src/BulletFactory.js::hitsBlockingTile/hitsBuilding/hitsHazard/checkTerrainCollision/checkStructureCollision` | `apps/server-ts/src/runtime/bullet-runtime.ts` (exists), `packages/sim-core/src/combat.ts` (exists), `apps/server-ts/src/domain/map/MapService.ts` (new) | done |
| S1-26 Notifications integration (Discord) | `server/src/utils/DiscordNotifier.js`; `server/src/utils/discordMessages.js` | `apps/server-ts/src/adapters/notifications/DiscordNotifier.ts` (new) | done |

## Stage 2: Client Gameplay + Rendering + UX Parity (TS)

| Gap ID | Legacy anchors (`master`) | TS target files/modules | Status |
|---|---|---|---|
| S2-01 Full socket event handling surface | `client/src/SocketListener.js::listen/handleBulletShot/applyHealthUpdate/...` | `apps/client-ts/src/network/socket.ts` (exists), `apps/client-ts/src/app/network-events.ts` (exists), `apps/client-ts/src/network/event-router.ts` (new) | in_progress |
| S2-02 Core movement + unstick + nearest-safe fallback | `client/src/play.js::movePlayer/attemptUnstick/findNearestSafeOffset` | `apps/client-ts/src/gameplay/player-movement.ts` (new), `packages/sim-core/src/collision-world.ts` (new) | done |
| S2-03 Client collision helpers parity | `client/src/collision/collision-player.js`; `collision-building.js`; `collision-bullet.js`; `collision-helpers.js` | `apps/client-ts/src/gameplay/collision/*.ts` (new) | done |
| S2-04 Building placement client rules + sync behavior | `client/src/factories/BuildingFactory.js::newBuilding/demolishBuilding/recomputeCityBuildPermissions` | `apps/client-ts/src/gameplay/buildings/BuildingClientService.ts` (new), `apps/client-ts/src/app/intents.ts` (exists) | open |
| S2-05 Inventory icon stack/select/arm/drop semantics | `client/src/factories/IconFactory.js::pickupIcon/dropSelectedIcon/toggleBombArming/confirmPickup` | `apps/client-ts/src/gameplay/items/IconInventoryService.ts` (new) | open |
| S2-06 Items/hazards lifecycle on client | `client/src/factories/ItemFactory.js::triggerMine/detonateBombAt/fireBullet/pickupOrbItem/...` | `apps/client-ts/src/gameplay/items/ItemWorldService.ts` (new), `apps/client-ts/src/gameplay/hazards/HazardClientService.ts` (new) | in_progress |
| S2-07 Bullet client visuals/semantics parity | `client/src/factories/BulletFactory.js::*` | `apps/client-ts/src/gameplay/bullets/BulletClientService.ts` (new), `packages/sim-core/src/bullet.ts` (exists) | open |
| S2-08 Draw panel + finance + inventory + radar | `client/src/draw/draw-panel-interface.js::drawPanel/drawFinance/drawItems/updateRadar/drawHealth` | `apps/client-ts/src/render/scene.ts` (exists) | in_progress |
| S2-09 Build menu UI and ghost placement | `client/src/draw/draw-building-interface.js::setupBuildingMenu/drawBuilding` | `apps/client-ts/src/ui/build-menu/BuildMenu.ts` (new), `apps/client-ts/src/ui/build-menu/GhostPlacement.ts` (new) | open |
| S2-10 Item drawing priorities and hidden enemy mines | `client/src/draw/draw-items.js::drawMine/drawDFG/getItemRenderPriority` | `apps/client-ts/src/render/items/ItemRenderer.ts` (new) | open |
| S2-11 Ground/tile/changing layer rendering | `client/src/draw/draw-ground.js`; `draw-tiles.js`; `draw-changing.js` | `apps/client-ts/src/render/layers/*.ts` (new) | open |
| S2-12 Name labels rank/callsign/city rendering | `client/src/draw/nameLabels.js`; `draw-changing.js` | `apps/client-ts/src/render/labels/NameLabelRenderer.ts` (new) | open |
| S2-13 Muzzle flash + floating points + camera shake | `client/src/effects/muzzleFlash.js`; `floatingPoints.js`; `camera-shake.js` | `apps/client-ts/src/render/effects/*.ts` (new) | open |
| S2-14 Map loader/orientation behavior | `client/src/mapBuilder.js`; `client/src/cityBuilder.js` | `apps/client-ts/src/world/map-loader.ts` (new), `apps/client-ts/src/world/city-layout.ts` (new) | open |
| S2-15 Full keyboard semantics (`Shift`, `Ctrl`, `B`, `D`, `U`, etc.) | `client/src/input/input-keyboard.js::attemptPrimaryFire/dropInventoryItem/...` | `apps/client-ts/src/app/input.ts` (exists), `apps/client-ts/src/app/intents.ts` (exists) | in_progress |
| S2-16 Mouse semantics, hit-area sync, right-click behaviors | `client/src/input/input-mouse-core.js::setupMouseInputsWithPixi/syncHitArea`; `input-mouse.js` | `apps/client-ts/src/input/mouse-input.ts` (new) | in_progress |
| S2-17 Lobby UX parity (city list, join, denial, release, high scores) | `client/src/lobby/LobbyManager.js::*` | `apps/client-ts/src/ui/lobby/LobbyManager.ts` (new), `apps/client-ts/src/app/network-events.ts` (exists) | open |
| S2-18 Identity UX parity (Google and local identity flows) | `client/src/identity/IdentityManager.js::*` | `apps/client-ts/src/ui/identity/IdentityManager.ts` (new) | open |
| S2-19 Chat UX parity | `client/src/ui/ChatManager.js::*` | `apps/client-ts/src/ui/chat/ChatManager.ts` (new) | open |
| S2-20 Help modal parity | `client/src/ui/HelpModal.js::*` | `apps/client-ts/src/ui/help/HelpModal.ts` (new) | open |
| S2-21 Map modal parity | `client/src/ui/MapModal.js::*` | `apps/client-ts/src/ui/map/MapModal.ts` (new) | open |
| S2-22 Options modal parity | `client/src/ui/OptionsModal.js::*` | `apps/client-ts/src/ui/options/OptionsModal.ts` (new) | open |
| S2-23 Tutorial/training flow parity | `client/src/ui/TutorialManager.js::*` | `apps/client-ts/src/ui/tutorial/TutorialManager.ts` (new) | open |
| S2-24 Intro/start flow parity | `client/src/ui/IntroModal.js`; `client/app.js` intro wiring | `apps/client-ts/src/ui/intro/IntroModal.ts` (new), `apps/client-ts/src/main.ts` (exists) | open |
| S2-25 Rogue tank gameplay parity | `client/src/rogue/RogueTankManager.js::*` | `apps/client-ts/src/gameplay/rogue/RogueTankService.ts` (new) | open |
| S2-26 Defender bot client debug/pathing parity | `client/src/defenders/*`; `client/src/draw/draw-bot-debug.js` | `apps/client-ts/src/gameplay/defenders/*.ts` (new), `apps/client-ts/src/render/debug/BotDebugLayer.ts` (new) | open |
| S2-27 Audio/music loop parity | `client/src/audio/AudioManager.js`; `MusicManager.js` | `apps/client-ts/src/audio/AudioManager.ts` (new), `apps/client-ts/src/audio/MusicManager.ts` (new) | open |
| S2-28 Fullscreen/resize/ui interaction parity | `client/app.js::resizeToWindow/toggleFullscreen/updateInteractionHitArea` | `apps/client-ts/src/ui/window/WindowModeService.ts` (new), `apps/client-ts/src/render/scene.ts` (exists) | in_progress |
| S2-29 Force-draw optimization semantics | `client/app.js`; `draw-panel-interface.js` forceDraw pattern | `apps/client-ts/src/render/dirty-flags.ts` (new), `apps/client-ts/src/app/state.ts` (exists) | open |
| S2-30 Asset parity (sprites, map.dat, audio) | `client/data/*`; `client/app.js` resource loader list | `apps/client-ts/src/assets/manifest.ts` (new), `apps/client-ts/public/*` (new) | open |

## Stage 3: Protocol/Event Contract Consolidation

| Gap ID | Legacy anchors (`master`) | TS target files/modules | Status |
|---|---|---|---|
| S3-01 Move from partial typed payload set to full gameplay schemas | `client/src/SocketListener.js` + `server/src/*` event payload handling | `packages/protocol/src/events.ts` (exists, expand) | in_progress |
| S3-02 Remove event-name split-brain (legacy colon names vs dot names) without losing compatibility | legacy uses `player:health`, `players:snapshot`, etc.; TS currently uses dot variants in handlers | `packages/protocol/src/events.ts` (exists), `packages/protocol/src/envelope.ts` (exists), `apps/*/event-adapter.ts` (new) | done |
| S3-03 Expand server dispatch beyond 5 handlers | `server/src/PlayerFactory.js`, `BuildingFactory.js`, `BulletFactory.js`, `HazardManager.js`, `DefenseManager.js` | `apps/server-ts/src/runtime/dispatch.ts` (exists, expand heavily) | in_progress |
| S3-04 Expand client applyServerEvent beyond 5 handlers | `client/src/SocketListener.js` handlers | `apps/client-ts/src/app/network-events.ts` (exists, expand heavily) | in_progress |
| S3-05 Versioned envelope migration policy | implicit envelope usage in legacy socket events | `packages/protocol/src/envelope.ts` (exists), `docs/event-versioning.md` (new) | done |

## Stage 4: Effect.ts Architecture Mapping

| Gap ID | Legacy/current anchors | TS target files/modules | Status |
|---|---|---|---|
| S4-01 Domain services composed via `Layer` | current TS runtime is mutable-map + `Effect.runSync` wrappers (`apps/server-ts/src/runtime/GameRuntime.ts`) | `apps/server-ts/src/layers/RuntimeLayer.ts` (new), `apps/server-ts/src/domain/*Service.ts` (new) | in_progress |
| S4-02 Typed domain error ADTs and mapping to rejection events | current reject strings in `apps/server-ts/src/runtime/types.ts` | `apps/server-ts/src/domain/errors.ts` (new), `apps/server-ts/src/runtime/rejections.ts` (new) | done |
| S4-03 Effectful event ingress queue/backpressure | current direct socket dispatch path in `apps/server-ts/src/main.ts` | `apps/server-ts/src/runtime/EventIngress.ts` (new), `apps/server-ts/src/runtime/EventQueue.ts` (new) | done |
| S4-04 Deterministic schedulers for ticks | current `setInterval` tick in `apps/server-ts/src/main.ts` | `apps/server-ts/src/runtime/TickScheduler.ts` (new) | done |
| S4-05 Replace mutable singleton maps with `Ref`/`SynchronizedRef` state capsules | current `createRuntimeState` map mutation | `apps/server-ts/src/runtime/state/RuntimeStateRef.ts` (new), `apps/client-ts/src/app/ClientStateRef.ts` (new) | done |
| S4-06 Structured logging/metrics/tracing through Effects | current ad hoc console/debug patterns | `apps/server-ts/src/observability/*.ts` (new), `apps/client-ts/src/observability/*.ts` (new) | in_progress |
| S4-07 Resource lifecycle management for sockets and scene runtime | current imperative start/stop in `apps/client-ts/src/main.ts` and server main | `apps/client-ts/src/runtime/RuntimeScope.ts` (new), `apps/server-ts/src/runtime/RuntimeScope.ts` (new) | done |
| S4-08 Effect-based integration adapters (persistence/discord/auth) | legacy adapters in `server/src/users/*`, `server/src/utils/DiscordNotifier.js` | `apps/server-ts/src/adapters/*` (new) | done |

## Stage 5: Test Parity Mapping

| Gap ID | Legacy anchors (`master`) | TS target files/modules | Status |
|---|---|---|---|
| S5-01 Port server building+research regression suite | `server/test/building-factory-*.test.js` | `apps/server-ts/test/buildings/*.test.ts` (new) | open |
| S5-02 Port server hazard/bomb/mine/DFG tests | `server/test/hazard-*.test.js` | `apps/server-ts/test/hazards/*.test.ts` (new) | open |
| S5-03 Port server orb/city scoring tests | `server/test/orb-*.test.js`; `server/test/score-service.test.js` | `apps/server-ts/test/orb/*.test.ts`, `apps/server-ts/test/score/*.test.ts` (new) | open |
| S5-04 Port server lobby/assignment/release tests | `server/test/lobby-player-count.test.js`; `player-factory-*.test.js` | `apps/server-ts/test/lobby/*.test.ts` (new) | open |
| S5-05 Port server inventory/factory duplication tests | `server/test/factory-duplication.test.js`; `icon-drop*.test.js` | `apps/server-ts/test/inventory/*.test.ts` (new) | open |
| S5-06 Port server security validation tests | `server/test/security-validation.test.js` | `apps/server-ts/test/security/*.test.ts` (new) | open |
| S5-07 Port client collision/movement tests | `client/test/collision-*.test.*`; `defender-*.test.js` | `apps/client-ts/test/collision/*.test.ts` (new), `packages/sim-core/test/*.test.ts` (exists/expand) | in_progress |
| S5-08 Port client item/icon/bullet behavior tests | `client/test/item-factory-*.test.js`; `icon-factory-*.test.js`; `bullet-shot.test.mjs` | `apps/client-ts/test/items/*.test.ts`, `apps/client-ts/test/bullets/*.test.ts` (new) | open |
| S5-09 Port client UI/label/tutorial tests | `client/test/name-labels.test.mjs`; `tutorial-toggle-visibility.test.mjs`; `input-mouse-hit-area.test.js` | `apps/client-ts/test/ui/*.test.ts` (new) | open |
| S5-10 Port benchmark/serialization coverage | `server/test/json-bench.js`; `client/test/json-client-bench.js`; `proto-client-bench.js` | `apps/*/test/bench/*.test.ts` (new), `packages/protocol/test` (exists/expand) | open |
| S5-11 Port cucumber behavior scenarios | `features/*.feature`; `features/steps/*.js` | `features-ts/*.feature` (new) or `apps/server-ts/test/behavior/*.test.ts` (new) | open |
| S5-12 Add parity gate in CI | legacy CI ran lint/test/coverage/cucumber | `.github/workflows/test.yml` (exists, expand), `.gitlab-ci.yml` (exists, expand) | open |

## Suggested New TS Module Tree (High-level)

```txt
apps/server-ts/src/
  domain/
    lobby/
    identity/
    security/
    spawn/
    health/
    buildings/
    research/
    population/
    economy/
    inventory/
    factories/
    icons/
    hazards/
    defense/
    orb/
    score/
    chat/
    fake-cities/
    bots/
    map/
  adapters/
    persistence/
    notifications/
  layers/
  runtime/
    state/

apps/client-ts/src/
  gameplay/
    collision/
    buildings/
    bullets/
    items/
    hazards/
    rogue/
    defenders/
  ui/
    lobby/
    identity/
    chat/
    panel/
    build-menu/
    help/
    map/
    options/
    tutorial/
    intro/
    window/
  render/
    layers/
    items/
    labels/
    effects/
    debug/
  assets/
  input/
  audio/
  observability/
```

## Recommended Execution Order
1. Stage 0 contract freeze (`S0-*`)
2. Stage 1 server authority (`S1-*`) before rich client UX
3. Stage 3 protocol consolidation in parallel with Stage 1
4. Stage 2 client gameplay + UI restore
5. Stage 4 Effect architecture hardening while systems land
6. Stage 5 parity tests + CI gate hardening


## Status Update (2026-02-23)
- `S0-01`: done
- `S0-02`: done
- `S0-03`: done
- `S1-01`: done (lobby assignment constraints)
- `S1-02`: done (leave/release lifecycle)
- `S4-03`: done (event ingress queue)
- `S4-04`: done (tick scheduler)
- `S4-05`: done (runtime state ref)
- `S4-01`: in_progress (runtime bootstrap through Layer)
- `S4-02`: done (typed domain errors + rejection mapping)
- `S4-06`: in_progress (runtime/client observability modules wired with Effect log programs)
- `S4-08`: done (persistence + discord adapters now include webhook transport behavior and dedicated test coverage)
- `S1-03`: done (identity binding on join)
- `S1-04`: done (score profile hydration + orb score profile updates)
- `S1-18`: done (defense deploy + damage/update/remove + city-orbed cleanup + footprint/hazard occupancy parity slice)
- `S1-26`: done (orb notifier now uses canonical runtime user identity and async-safe Effect dispatch with adapter tests)
- `S1-12`: done (house attachment/population parity slice implemented in `PopulationService` and wired through dispatch/system ticks)
- `S3-01`: in_progress (`score.profile`, `defense.*`, `bullet.resolved` terrain/hazard reasons, `hazard.remove` city-orbed reason coverage, legacy bullet/build alias support, plus `population.update` schema coverage)
- `S3-02`: done (alias map expanded with `defense:deploy`, `defense:update`, `inventory:update`, `bullet:fired`, `bullet:resolved`, `new_building`, and `demolish_building`)
- `S1-24`: done (legacy `map.dat` decode and city layout parsing ports landed with canonical data assets under `apps/server-ts/data/*`)
- `S1-25`: done (authoritative bullet collision now consumes map-loader-fed blocking tiles in addition to building/defense/hazard checks)
- `S3-03`: in_progress (dispatch expanded for identity/profile + defense deploy + orb cleanup removal emission)
- `S3-04`: in_progress (client apply path includes explicit typed ingress decode router + profile/defense/building/bullet/icon/population state handling)
- `S1-21`: done (team chat now routes only to same-city sockets, global chat remains broadcast, and join-time chat history is visibility-filtered)
- `S3-03`: in_progress (dispatch chat path now includes explicit scoped routing semantics and helper extraction for strict maintainability compliance)
- `S2-01`: in_progress (event ingress now routes through typed decode/canonicalization boundary before apply, retaining prior authoritative world event handling)
- `S2-16`: in_progress (mouse input module now handles left/right click semantics, context-menu suppression, hit-area sync on resize, and pointer-state tracking)
- `S2-28`: in_progress (window mode service now synchronizes renderer size on resize and supports fullscreen toggling with lifecycle cleanup)
- `S2-08`: in_progress (HUD now displays local-city population derived from authoritative population updates)
- `S2-02`: done (client movement now uses collision-aware stepping with nearest-safe unstick fallback in `moveLocalPlayer`)
- `S2-03`: done (client collision helpers now exist under `apps/client-ts/src/gameplay/collision/*` and are wired into loop movement)
- `S5-07`: in_progress (new sim-core/client movement collision tests added for blocking and unstick behavior)
- `S5-01,S5-09`: in_progress (tests now also cover notifier webhook adapter, client ingress router decode/canonicalization behavior, mouse input semantics, window mode service behaviors, and map/city loader parity coverage)
- `S1-22`: done (fake-city activation/cooldown lifecycle ported and wired into system ticks/orb cooldown path through `FakeCityService`)
- `S1-23`: done (defender + rogue bot authority ported with server-side spawn/move/fire/cleanup behavior through `DefenderBotService` + `RogueBotService`)
- `S3-01`: in_progress (`event.rejected` schema + `event:rejected` alias canonicalization added alongside `player.bot_damage` and prior protocol expansions)
- Other S1/S2/S3/S4/S5 IDs: deferred or in_progress per `docs/rewrite-progress.md`

# Rewrite Progress

## Current Stage
- `S2` checkpoint after landing client collision-aware movement parity slice (`S2-02`/`S2-03`) and movement/collision tests (`S5-07`).

## S-ID Status Ledger
| S-ID | Status | Notes |
|---|---|---|
| S0-01 | done | Contract inventory kept current in gap docs + checklist |
| S0-02 | done | Event parity matrix updated with new canonical/legacy mappings |
| S0-03 | done | Acceptance criteria retained and applied in stage gates |
| S1-01 | done | Lobby mayor/recruit assignment and overflow denial |
| S1-02 | done | Lobby leave/release lifecycle + disconnect handling |
| S1-05 | done | Player update anti-cheat distance validator (`PlayerUpdateValidator`) |
| S1-06 | done | Spawn-safe relocation and map clamp via `SpawnService` + `CollisionService` |
| S1-07 | done | Hospital healing tick parity slice via `HealingService` and `player.health` source tagging |
| S1-08 | done | Medkit authoritative item-use flow (`item.use.request`) consuming inventory and healing |
| S1-11 | done | Authoritative research start/tick/update flow |
| S1-13 | done | City economy tick + finance broadcast |
| S1-14 | done | Inventory cap/release semantics via per-player inventory store + disconnect release |
| S1-15 | done | Factory production tick + collect/stock flow |
| S1-16 | done | Icon pickup authority (`icon.pickup.request`) wired to stock decrement + inventory confirm |
| S1-17 | done | Hazard deploy/tick/detonation/remove flow |
| S1-19 | done | Orb drop validation + target-city reset + city/orb events |
| S1-20 | done | Score promotion event emission on orb success |
| S1-21 | done | Chat now enforces city-scoped team delivery, global broadcast, and join-time filtered history |
| S1-09 | done | Mayor-only build authority + city spend + collision/chain/research gates |
| S1-10 | done | Demolish reject reasons now emitted to requester via `demolish.denied` |
| S1-03 | done | Join flow now binds canonical runtime user identity (`userId`) and hydrates profile |
| S1-04 | done | Score profile hydration + orb-award updates emitted via `score.profile` |
| S1-18 | done | Defense authority now covers occupancy, damage/update/remove, and orb city cleanup lifecycle |
| S1-24 | done | Legacy map and city layout loaders ported (`MapService`, `CityLayoutService`) with canonical assets hydrated under `apps/server-ts/data/*` |
| S1-25 | done | Bullet collision now resolves against buildings/defenses/hazards and map-loader-fed runtime blocking tiles (`hit_terrain`) |
| S1-26 | done | Orb victory notifier now resolves canonical runtime user identity, posts through Effect-based Discord webhook adapter when configured, and remains covered by runtime tests |
| S1-12 | done | House attachment + population tick/remove authority implemented via `PopulationService` with canonical `population.update` emissions |
| S1-22 | done | Fake-city lifecycle/cooldown authority landed via `FakeCityService` and runtime system-tick integration |
| S1-23 | done | Defender/rogue bot server authority landed via `DefenderBotService` + `RogueBotService` with runtime movement/fire/cleanup |
| S3-01 | in_progress | Contract compatibility now also includes canonical `player.bot_damage` with ingress alias normalization for `player:bot_damage` |
| S3-02 | done | `:` ingress alias compatibility centralized via protocol adapter (including `defense:deploy`/`defense:update`, `inventory:update`, and bullet aliases) |
| S3-03 | in_progress | Dispatch expanded for identity/profile, defense deploy authority, orb cleanup emission, and scoped chat routing (`team` vs `global`) |
| S3-04 | in_progress | Client apply path remains expanded for profile/defense/building lifecycle plus bullet/icon/population state, with new typed ingress decode router boundary (`network/event-router.ts`) |
| S3-05 | done | Versioning strategy kept current |
| S2-08 | in_progress | HUD now reflects score profile, city population, bullet counts, and last icon pickup alongside finance/research/factory/hazard/chat + deny counters; world rendering includes authoritative building/defense/hazard/bullet objects |
| S2-02 | done | Client movement now uses collision-aware stepping + nearest-safe unstick fallback through `moveLocalPlayer` and `CollisionWorld` primitives |
| S2-03 | done | Client collision helper modules landed (`collision-helpers.ts`, `collision-player.ts`) and are wired in gameplay loop |
| S2-15 | in_progress | Keyboard aliases now include legacy-friendly bindings (`S/Down`, `E`, `O`, `H`, `Delete`) while preserving existing request intents |
| S2-16 | in_progress | Mouse input now maps left/right click controls, suppresses context menu, syncs interaction surface dimensions on resize, and tracks pointer position/inside state |
| S2-28 | in_progress | Window/fullscreen service now handles resize-driven renderer synchronization and double-click fullscreen toggle lifecycle management |
| S2-01 | in_progress | Client event ingress now routes through explicit typed decode/canonicalization boundary (`decodeServerEnvelope`) before application |
| Other S2 IDs | deferred | Full UI/UX parity pending |
| S4-01 | in_progress | Runtime layer composition introduced in server bootstrap |
| S4-02 | done | Typed domain errors + rejection mapping (`errors.ts`, `rejections.ts`) |
| S4-03 | done | Queue ingress remains active |
| S4-04 | done | Effect tick scheduler remains active |
| S4-05 | done | Ref-based runtime state remains active |
| S4-07 | done | Runtime scope lifecycle remains active |
| S4-06 | in_progress | Structured runtime/client log primitives added (`RuntimeLogger`, `ClientLogger`) |
| S4-08 | done | Effect-based persistence/notification adapters now exercised by live orb/profile flows; Discord adapter supports configured webhook transport with test coverage |
| S5-01,S5-02,S5-03,S5-04,S5-06 | in_progress | Server parity tests expanded with house/population attachment growth + cleanup authority, map decode/loader coverage, city layout parsing coverage, terrain bullet blocking, and orb notifier coverage |
| S5-09 | in_progress | Client network/event coverage now also validates typed ingress decode router canonicalization and malformed envelope rejection |
| S5-07 | in_progress | Collision/movement parity tests now include sim-core collision-world coverage and client movement blocking/unstick assertions |
| Other S5 IDs | deferred | Legacy parity matrix port incomplete |

## Exact Files Changed In This Delivery
- `apps/client-ts/src/app/loop.ts`
- `apps/client-ts/src/gameplay/player-movement.ts`
- `apps/client-ts/src/gameplay/collision/collision-helpers.ts`
- `apps/client-ts/src/gameplay/collision/collision-player.ts`
- `apps/client-ts/test/player-movement.test.ts`
- `packages/sim-core/src/collision-world.ts`
- `packages/sim-core/src/index.ts`
- `packages/sim-core/test/collision-world.test.ts`
- `docs/parity-checklist.md`
- `docs/rewrite-progress.md`
- `docs/typescript-gap-mapping.md`

## Validation Results
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run test`: pass
- `npm run rewrite:check:strict`: pass

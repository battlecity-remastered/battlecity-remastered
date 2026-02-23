# Rewrite Progress

## Current Stage
- `S5` checkpoint after additional `S2 -> S5` parity slice delivery (mouse semantics, hit-area sync, right-click behavior, and regression tests).

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
| S1-25 | in_progress | Bullet collision now resolves against buildings/defenses/hazards and runtime blocking tiles (`hit_terrain`); full map-loader-fed terrain parity remains coupled to S1-24 |
| S1-26 | done | Orb victory notifier now resolves canonical runtime user identity, posts through Effect-based Discord webhook adapter when configured, and remains covered by runtime tests |
| S1-12 | done | House attachment + population tick/remove authority implemented via `PopulationService` with canonical `population.update` emissions |
| S1-22,S1-23,S1-24 | deferred | Not yet parity-complete vs legacy systems |
| S3-01 | in_progress | Contract compatibility expanded with legacy aliases for `bullet:fired`, `bullet:resolved`, `new_building`, `demolish_building`, and `population:update` in addition to prior payload coverage |
| S3-02 | done | `:` ingress alias compatibility centralized via protocol adapter (including `defense:deploy`/`defense:update`, `inventory:update`, and bullet aliases) |
| S3-03 | in_progress | Dispatch expanded for identity/profile, defense deploy authority, orb cleanup emission, and scoped chat routing (`team` vs `global`) |
| S3-04 | in_progress | Client apply path remains expanded for profile/defense/building lifecycle plus bullet/icon/population state, with new typed ingress decode router boundary (`network/event-router.ts`) |
| S3-05 | done | Versioning strategy kept current |
| S2-08 | in_progress | HUD now reflects score profile, city population, bullet counts, and last icon pickup alongside finance/research/factory/hazard/chat + deny counters; world rendering includes authoritative building/defense/hazard/bullet objects |
| S2-15 | in_progress | Keyboard aliases now include legacy-friendly bindings (`S/Down`, `E`, `O`, `H`, `Delete`) while preserving existing request intents |
| S2-16 | in_progress | Mouse input now maps left/right click controls, suppresses context menu, syncs interaction surface dimensions on resize, and tracks pointer position/inside state |
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
| S5-01,S5-02,S5-03,S5-04,S5-06 | in_progress | Server parity tests expanded with house/population attachment growth + cleanup authority in addition to identity/profile + defense + bullet/hazard/terrain + orb notifier coverage |
| S5-09 | in_progress | Client network/event coverage now also validates typed ingress decode router canonicalization and malformed envelope rejection |
| Other S5 IDs | deferred | Legacy parity matrix port incomplete |

## Exact Files Changed In This Delivery
- `apps/client-ts/src/app/state.ts`
- `apps/client-ts/src/input/mouse-input.ts`
- `apps/client-ts/src/main.ts`
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/test/mouse-input.test.ts`
- `docs/parity-checklist.md`
- `docs/rewrite-progress.md`
- `docs/typescript-gap-analysis.md`
- `docs/typescript-gap-mapping.md`

## Validation Results
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run test`: pass
- `npm run rewrite:check:strict`: pass

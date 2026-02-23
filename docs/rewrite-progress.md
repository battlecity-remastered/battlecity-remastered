# Rewrite Progress

## Current Stage
- `S2` checkpoint after landing help/map/options modal parity slices with runtime hotkeys and coverage tests.

## S-ID Status Ledger
| S-ID | Status | Notes |
|---|---|---|
| S0-01 | done | Contract inventory kept current in gap docs + checklist |
| S0-02 | done | Event parity matrix updated with canonical/legacy mappings |
| S0-03 | done | Acceptance criteria retained and applied in stage gates |
| S1-01 | done | Lobby mayor/recruit assignment and overflow denial |
| S1-02 | done | Lobby leave/release lifecycle + disconnect handling |
| S1-03 | done | Join flow binds canonical runtime user identity (`userId`) and hydrates profile |
| S1-04 | done | Score profile hydration + orb-award updates emitted via `score.profile` |
| S1-05 | done | Player update anti-cheat distance validator (`PlayerUpdateValidator`) |
| S1-06 | done | Spawn-safe relocation and map clamp via `SpawnService` + `CollisionService` |
| S1-07 | done | Hospital healing tick parity slice via `HealingService` |
| S1-08 | done | Medkit authoritative item-use flow (`item.use.request`) |
| S1-09 | done | Mayor-only build authority + city spend + collision/chain/research gates |
| S1-10 | done | Demolish reject reasons emitted to requester via `demolish.denied` |
| S1-11 | done | Authoritative research start/tick/update flow |
| S1-12 | done | House attachment + population tick/remove authority with `population.update` |
| S1-13 | done | City economy tick + finance broadcast |
| S1-14 | done | Inventory cap/release semantics via per-player inventory store + disconnect release |
| S1-15 | done | Factory production tick + collect/stock flow |
| S1-16 | done | Icon pickup authority wired to stock decrement + inventory confirm |
| S1-17 | done | Hazard deploy/tick/detonation/remove flow |
| S1-18 | done | Defense authority covers occupancy, damage/update/remove, and orb cleanup |
| S1-19 | done | Orb drop validation + target-city reset + cleanup events |
| S1-20 | done | Score promotion event emission on orb success |
| S1-21 | done | Chat enforces city-scoped team delivery, global broadcast, and filtered history |
| S1-22 | done | Fake-city lifecycle/cooldown authority through runtime system ticks |
| S1-23 | done | Defender/rogue bot server authority (spawn/move/fire/cleanup) |
| S1-24 | done | Legacy map + city layout loaders ported (`MapService`, `CityLayoutService`) |
| S1-25 | done | Bullet collision resolves buildings/defenses/hazards and blocking terrain |
| S1-26 | done | Orb victory notifier uses canonical identity with Effect webhook adapter |
| S3-01 | in_progress | Protocol coverage expanded for implemented gameplay surface; non-gameplay legacy events remain intentionally deferred |
| S3-02 | done | `:` alias ingress compatibility centralized via protocol adapter |
| S3-03 | done | Dispatch handler inventory exported and test-asserted against authoritative inbound request set |
| S3-04 | done | Client apply-handler inventory exported and test-asserted against implemented server->client event set |
| S3-05 | done | Versioning strategy maintained and current |
| S2-01 | done | Client ingress routes through explicit typed decode/canonicalization boundary (`decodeServerEnvelope`) |
| S2-02 | done | Client movement uses collision-aware stepping + nearest-safe unstick fallback |
| S2-03 | done | Client collision helpers landed and wired in gameplay loop |
| S2-08 | in_progress | HUD + primitive world rendering parity slices active (finance/research/population/building/defense/hazard/bullet/chat telemetry) plus options-driven HUD visibility toggle |
| S2-15 | in_progress | Keyboard aliases include legacy-friendly bindings while preserving intent model |
| S2-16 | in_progress | Mouse controls/hit-area sync/pointer tracking parity slice active |
| S2-17 | in_progress | Lobby overlay manager now mirrors assignment/denial/release state in runtime UI layer |
| S2-19 | in_progress | Chat overlay manager now renders history/rate-limit state and sends team/global requests |
| S2-20 | in_progress | Help modal parity slice landed with runtime `F1` toggle and control reference surface |
| S2-21 | in_progress | Map modal parity slice landed with runtime `F2` toggle and assignment/world telemetry surface |
| S2-22 | in_progress | Options modal parity slice landed with runtime `F3` toggle (`HUD` visibility + overlay opacity controls) |
| S2-28 | in_progress | Window/fullscreen service handles resize sync and dbl-click toggle lifecycle |
| Other S2 IDs | deferred | Full visual/audio/modal parity remains documented and intentionally staged |
| S4-01 | in_progress | Runtime layer composition remains active in server bootstrap |
| S4-02 | done | Typed domain errors + rejection mapping (`errors.ts`, `rejections.ts`) |
| S4-03 | done | Queue ingress active (`EventIngress`) |
| S4-04 | done | Effect tick scheduler active (`TickScheduler`) |
| S4-05 | done | Ref-based runtime state active (`RuntimeStateRef`) |
| S4-06 | done | Structured runtime/client log primitives now wired for socket lifecycle + decode paths |
| S4-07 | done | Runtime resource lifecycle managed in `RuntimeScope` |
| S4-08 | done | Effect-based persistence/notification adapters exercised by live flows |
| S5-01,S5-02,S5-03,S5-04,S5-06 | in_progress | Server parity tests remain expanded across gameplay authority domains |
| S5-07 | in_progress | Collision/movement parity tests active in sim-core + client suites |
| S5-08 | in_progress | Added dedicated client item/bullet intent behavior assertions (`item-bullet-intents.test.ts`) covering fire/pickup/use/hazard intent emission |
| S5-09 | in_progress | Client parity tests expanded with ingress canonicalization, handler inventory coverage, and modal hotkey/options helper assertions |
| S5-12 | done | CI parity gates now include explicit `typecheck` in both GitHub and GitLab pipelines |
| Other S5 IDs | deferred | Broader legacy behavior-matrix ports remain tracked and explicit |

## Exact Files Changed In This Delivery
- `apps/client-ts/src/app/state.ts`
- `apps/client-ts/src/main.ts`
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/src/ui/chat/ChatManager.ts`
- `apps/client-ts/src/ui/lobby/LobbyManager.ts`
- `apps/client-ts/src/ui/help/HelpModal.ts`
- `apps/client-ts/src/ui/map/MapModal.ts`
- `apps/client-ts/src/ui/options/OptionsModal.ts`
- `apps/client-ts/src/ui/modals/ModalHotkeys.ts`
- `apps/client-ts/test/help-map-modal.test.ts`
- `apps/client-ts/test/modal-hotkeys.test.ts`
- `apps/client-ts/test/options-modal.test.ts`
- `apps/client-ts/test/item-bullet-intents.test.ts`
- `docs/rewrite-progress.md`
- `docs/parity-checklist.md`
- `docs/typescript-gap-analysis.md`
- `docs/typescript-gap-mapping.md`

## Validation Results
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run test`: pass
- `npm run rewrite:check:strict`: pass

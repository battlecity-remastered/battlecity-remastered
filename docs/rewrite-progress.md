# Rewrite Progress

## Current Stage
- `S1` subsystem chunk (inventory + medkit + hospital healing authority), with coordinated `S3` contract and `S2` client state updates.

## S-ID Status Ledger
| S-ID | Status | Notes |
|---|---|---|
| S0-01 | done | Contract inventory kept current in gap docs + checklist |
| S0-02 | done | Event parity matrix updated with new canonical/legacy mappings |
| S0-03 | done | Acceptance criteria retained and applied in stage gates |
| S1-01 | done | Lobby mayor/recruit assignment and overflow denial |
| S1-02 | done | Lobby leave/release lifecycle + disconnect handling |
| S1-05 | done | Player update anti-cheat distance validator (`PlayerUpdateValidator`) |
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
| S1-21 | done | Chat message/history/rate-limit handling |
| S1-09 | done | Mayor-only build authority + city spend + collision/chain/research gates |
| S1-10 | done | Demolish reject reasons now emitted to requester via `demolish.denied` |
| S1-03,S1-04,S1-06,S1-12,S1-18,S1-22,S1-23,S1-24,S1-25,S1-26 | deferred | Not yet parity-complete vs legacy systems |
| S3-01 | in_progress | Contract expanded with inventory/item/icon authority events (`inventory.update`, `item.use.request`, `icon.pickup.*`) |
| S3-02 | done | `:` ingress alias compatibility centralized via protocol adapter |
| S3-03 | in_progress | Dispatch expanded for new authoritative subsystems |
| S3-04 | in_progress | Client event apply path expanded for new subsystems, including hazard lifecycle |
| S3-05 | done | Versioning strategy kept current |
| S2-08 | in_progress | HUD now reflects inventory/medkit alongside finance/research/factory/hazard/chat + deny counters |
| S2-15 | in_progress | Extended keyboard semantics + new request intents |
| S2-01 | in_progress | Client event handling coverage expanded with authoritative `inventory.update` application |
| Other S2 IDs | deferred | Full UI/UX parity pending |
| S4-01 | in_progress | Runtime layer composition introduced in server bootstrap |
| S4-02 | done | Typed domain errors + rejection mapping (`errors.ts`, `rejections.ts`) |
| S4-03 | done | Queue ingress remains active |
| S4-04 | done | Effect tick scheduler remains active |
| S4-05 | done | Ref-based runtime state remains active |
| S4-07 | done | Runtime scope lifecycle remains active |
| S4-06,S4-08 | deferred | Full observability + external adapters pending |
| S5-01,S5-02,S5-03,S5-04,S5-06 | in_progress | Server runtime parity tests expanded in `game-runtime.test.ts` |
| S5-09 | in_progress | Client network/event state coverage expanded |
| Other S5 IDs | deferred | Legacy parity matrix port incomplete |

## Exact Files Changed In This Delivery
- `apps/server-ts/src/domain/health/HealingService.ts`
- `apps/server-ts/src/domain/icons/IconDropService.ts`
- `apps/server-ts/src/domain/inventory/InventoryService.ts`
- `apps/server-ts/src/domain/items/ItemUseService.ts`
- `apps/server-ts/src/domain/errors.ts`
- `apps/server-ts/src/runtime/GameRuntime.ts`
- `apps/server-ts/src/runtime/dispatch.ts`
- `apps/server-ts/src/runtime/system-runtime.ts`
- `apps/server-ts/src/runtime/types.ts`
- `apps/server-ts/test/game-runtime.test.ts`
- `packages/protocol/src/events.ts`
- `packages/protocol/src/envelope.ts`
- `packages/protocol/src/event-type-adapter.ts`
- `apps/client-ts/src/app/intents.ts`
- `apps/client-ts/src/app/network-events.ts`
- `apps/client-ts/src/app/state.ts`
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/test/network-events.test.ts`
- `docs/rewrite-progress.md`

## Validation Results
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run test`: pass
- `npm run rewrite:check:strict`: pass

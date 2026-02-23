# TypeScript Parity Checklist

## Scope
- Legacy reference: `master@b104bfc1b41453b819bad2ace76754a4cfe6049c`
- TS baseline: `feature/typescript@06db060df2937071c5aff4e24c0b77d6794ce656`
- Stage order: `S0 -> S1 -> S3 -> S2 -> S4 -> S5`

## Ownership and Status
| S-ID | Subsystem | Owner | Status | Notes |
|---|---|---|---|---|
| S0-01 | Full gameplay contract inventory | rewrite | done | Captured in parity docs |
| S0-02 | Event parity matrix | rewrite | done | Added canonical/legacy mapping |
| S0-03 | Acceptance criteria by subsystem | rewrite | done | Added stage acceptance and DoD |
| S1-01 | Lobby assignment constraints | rewrite | done | Mayor/recruit + overflow denial added |
| S1-02 | Lobby lifecycle leave/release | rewrite | done | Leave flow + disconnect release events added |
| S1-03 | Identity/profile binding | rewrite | done | `lobby.join.request` now binds runtime `userId` and hydrates profile |
| S1-04 | Rank/points profile hydration | rewrite | done | `score.profile` emitted on join and orb-score award updates |
| S1-05 | Movement anti-cheat validation | rewrite | done | Distance-based validator and rejection mapping added |
| S1-06 | Spawn-safe relocation | rewrite | done | Player updates are clamped to world and relocated from building footprint collisions |
| S1-07 | Hospital healing tick | rewrite | done | `HealingService` heals in-city players when hospital building is present |
| S1-08 | Medkit authoritative use | rewrite | done | `item.use.request` consumes inventory and emits authoritative health updates |
| S1-09 | Building rules/cost/adjacency | rewrite | done | Mayor gate + city budget spend + research/collision/chain checks implemented |
| S1-10 | Demolish deny semantics | rewrite | done | Explicit `demolish.denied` reason feedback added for reject paths |
| S1-11 | Research lifecycle/tree | rewrite | done | Research start/tick/completion with authoritative updates |
| S1-12 | Population/house model | rewrite | deferred | Not yet ported |
| S1-13 | Economy tick parity | rewrite | done | City economy tick and finance broadcasts implemented |
| S1-14 | Inventory caps/release | rewrite | done | Per-player inventory cap and disconnect release semantics added |
| S1-15 | Factory production/stock | rewrite | done | Tick-based stock production and collect flow implemented |
| S1-16 | Icon drop/pickup authority | rewrite | done | `icon.pickup.request` decrements factory stock and confirms inventory pickup |
| S1-17 | Hazard lifecycle parity | rewrite | done | Hazard deploy/tick/detonate/remove flow implemented |
| S1-18 | Defense lifecycle parity | rewrite | in_progress | Authoritative defense deploy + damage/update + city-orbed cleanup landed |
| S1-19 | Orb + city reset parity | rewrite | done | Orb drop validates, resets target city state, emits city.orbed |
| S1-20 | Score/promotion events | rewrite | done | Score promotion event emitted from orb flow |
| S1-21 | Chat history/rate limit | rewrite | done | Chat message, history, and rate-limit handling added |
| S1-22 | Fake city lifecycle | rewrite | deferred | Not yet ported |
| S1-23 | Defender/rogue bots | rewrite | deferred | Not yet ported |
| S1-24 | Map/layout loaders | rewrite | deferred | Not yet ported |
| S1-25 | Bullet terrain/structure/hazard parity | rewrite | in_progress | Authoritative bullet collisions now handle buildings, defenses, and hazards; terrain tile blocking deferred pending map loader parity |
| S1-26 | Discord notifications | rewrite | in_progress | Orb victory notifier now invoked from authoritative orb drop flow |
| S3-01 | Full gameplay schemas | rewrite | in_progress | Added `score.profile`, `defense.*`, and `bullet.resolved` hazard-hit payload coverage in addition to prior subsystem coverage |
| S3-02 | `:` vs `.` compatibility | rewrite | done | Canonical emit + alias ingress decode |
| S3-03 | Server dispatch expansion | rewrite | in_progress | Added identity/profile hydration and defense deploy authority dispatch paths |
| S3-04 | Client apply handler expansion | rewrite | in_progress | Added `score.profile` and `defense.spawn/update/remove` application paths |
| S3-05 | Envelope versioning policy | rewrite | done | Documented in `docs/event-versioning.md` |
| S2-01 | Client event handling surface | rewrite | in_progress | New subsystem events now decoded/applied, including profile and defense lifecycle state |
| S2-08 | Panel/finance/research HUD | rewrite | in_progress | HUD now renders finance/research/factory/chat/medkit plus score profile and defense counts |
| S2-15 | Keyboard semantics | rewrite | in_progress | Extended keybind state and new gameplay intents |
| S2-* (remaining) | Client gameplay/UI parity set | rewrite | deferred | Full parity restoral pending |
| S4-01 | Layer-composed domain services | rewrite | in_progress | Server bootstrap now composes runtime through `RuntimeLayer` |
| S4-02 | Typed domain errors/rejections | rewrite | done | Domain error ADT + centralized rejection mapping added |
| S4-03 | Event ingress queue/backpressure | rewrite | done | Queue-based ingress added to server runtime |
| S4-04 | Deterministic schedulers | rewrite | done | Effect-based tick scheduler added |
| S4-05 | Ref/SynchronizedRef state | rewrite | done | Runtime state stored behind `Ref` |
| S4-06 | Structured observability | rewrite | in_progress | Effect-based runtime/client log modules added and wired in server bootstrap |
| S4-07 | Lifecycle scopes | rewrite | done | Runtime resources managed in `RuntimeScope` |
| S4-08 | Effect adapters (auth/discord/persistence) | rewrite | in_progress | Persistence + Discord adapters now exercised by join/orb authority flows |
| S5-01,S5-02,S5-03,S5-04,S5-06 | Test matrix + server parity slices | rewrite | in_progress | Expanded runtime tests for identity/profile, defense authority, and bullet-hazard collision authority slices |
| S5-09 | Client UI/network parity tests | rewrite | in_progress | Expanded client network-event tests for profile + defense event application |
| S5-* (remaining) | Test matrix + CI parity gates | rewrite | deferred | Broader legacy suite port still pending |

## Exit Criteria Tracking
- S0: done
- S1: in_progress
- S3: in_progress
- S2: in_progress
- S4: in_progress
- S5: in_progress

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
| S1-03 | Identity/profile binding | rewrite | deferred | Full auth/persistence integration pending |
| S1-04 | Rank/points profile hydration | rewrite | deferred | Score persistence/promotion parity pending |
| S1-05 | Movement anti-cheat validation | rewrite | deferred | Advanced validator pipeline pending |
| S1-06 | Spawn-safe relocation | rewrite | deferred | Terrain/building safe relocation pending |
| S1-07 | Hospital healing tick | rewrite | deferred | Not yet ported |
| S1-08 | Medkit authoritative use | rewrite | deferred | Not yet ported |
| S1-09 | Building rules/cost/adjacency | rewrite | deferred | Advanced rules/research gates pending |
| S1-10 | Demolish deny semantics | rewrite | deferred | Expanded deny reason parity pending |
| S1-11 | Research lifecycle/tree | rewrite | deferred | Not yet ported |
| S1-12 | Population/house model | rewrite | deferred | Not yet ported |
| S1-13 | Economy tick parity | rewrite | deferred | Not yet ported |
| S1-14 | Inventory caps/release | rewrite | deferred | Not yet ported |
| S1-15 | Factory production/stock | rewrite | deferred | Not yet ported |
| S1-16 | Icon drop/pickup authority | rewrite | deferred | Not yet ported |
| S1-17 | Hazard lifecycle parity | rewrite | deferred | Not yet ported |
| S1-18 | Defense lifecycle parity | rewrite | deferred | Not yet ported |
| S1-19 | Orb + city reset parity | rewrite | deferred | Not yet ported |
| S1-20 | Score/promotion events | rewrite | deferred | Not yet ported |
| S1-21 | Chat history/rate limit | rewrite | deferred | Core message schema only |
| S1-22 | Fake city lifecycle | rewrite | deferred | Not yet ported |
| S1-23 | Defender/rogue bots | rewrite | deferred | Not yet ported |
| S1-24 | Map/layout loaders | rewrite | deferred | Not yet ported |
| S1-25 | Bullet terrain/structure parity | rewrite | deferred | Current bullet collision is minimal |
| S1-26 | Discord notifications | rewrite | deferred | Integration adapter not implemented yet |
| S3-01 | Full gameplay schemas | rewrite | in_progress | Added canonical + compatibility scaffolding |
| S3-02 | `:` vs `.` compatibility | rewrite | done | Canonical emit + alias ingress decode |
| S3-03 | Server dispatch expansion | rewrite | in_progress | Added lobby leave handling |
| S3-04 | Client apply handler expansion | rewrite | in_progress | Added lobby snapshot + denied/released handling |
| S3-05 | Envelope versioning policy | rewrite | done | Documented in `docs/event-versioning.md` |
| S2-* | Client gameplay/UI parity set | rewrite | deferred | Restorations pending |
| S4-01 | Layer-composed domain services | rewrite | in_progress | Lobby service extracted; broader layering pending |
| S4-02 | Typed domain errors/rejections | rewrite | in_progress | Runtime rejection ADT introduced |
| S4-03 | Event ingress queue/backpressure | rewrite | done | Queue-based ingress added to server runtime |
| S4-04 | Deterministic schedulers | rewrite | done | Effect-based tick scheduler added |
| S4-05 | Ref/SynchronizedRef state | rewrite | done | Runtime state stored behind `Ref` |
| S4-06 | Structured observability | rewrite | deferred | Limited logging only |
| S4-07 | Lifecycle scopes | rewrite | done | Runtime resources managed in `RuntimeScope` |
| S4-08 | Effect adapters (auth/discord/persistence) | rewrite | deferred | Not yet ported |
| S5-01..S5-12 | Test matrix + CI parity gates | rewrite | in_progress | Added protocol/server tests + strict gate docs |

## Exit Criteria Tracking
- S0: done
- S1: in_progress
- S3: in_progress
- S2: deferred
- S4: in_progress
- S5: in_progress

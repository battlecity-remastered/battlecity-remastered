# TypeScript Parity Checklist

## Scope
- Legacy reference: `master@b104bfc1b41453b819bad2ace76754a4cfe6049c`
- TS baseline: `feature/typescript@06db060df2937071c5aff4e24c0b77d6794ce656`
- Stage order: `S0 -> S1 -> S3 -> S2 -> S4 -> S5`

## Ownership and Status
| S-ID | Subsystem | Owner | Status | Notes |
|---|---|---|---|---|
| S0-01 | Full gameplay contract inventory | rewrite | done | Captured in parity docs |
| S0-02 | Event parity matrix | rewrite | done | Canonical/legacy mapping maintained |
| S0-03 | Acceptance criteria by subsystem | rewrite | done | Stage criteria tracked and validated |
| S1-01..S1-26 | Authoritative server gameplay domains | rewrite | done | Lobby/economy/research/buildings/factories/hazards/defense/orb/score/security/fake-city/bots/map/adapters landed with regression tests |
| S3-01 | Full gameplay schemas | rewrite | in_progress | Implemented gameplay contract surface is schema-complete; legacy non-gameplay events remain deferred |
| S3-02 | `:` vs `.` compatibility | rewrite | done | Canonical emit + alias ingress normalization centralized |
| S3-03 | Server dispatch expansion | rewrite | done | Dispatch coverage is explicit and test-asserted (`dispatch-coverage.test.ts`) |
| S3-04 | Client apply handler expansion | rewrite | done | Apply coverage is explicit and test-asserted (`network-handler-coverage.test.ts`) |
| S3-05 | Envelope versioning policy | rewrite | done | Versioning + migration policy documented |
| S2-01 | Client event handling surface | rewrite | done | Typed decode/canonicalization boundary active before apply |
| S2-02 | Core movement + unstick + nearest-safe fallback | rewrite | done | Collision-aware movement with safe fallback |
| S2-03 | Client collision helpers parity | rewrite | done | Helper modules landed and tested |
| S2-08 | Panel/finance/research HUD | rewrite | in_progress | HUD + primitive world render parity slice active |
| S2-15 | Keyboard semantics | rewrite | in_progress | Legacy-friendly aliases expanded |
| S2-16 | Mouse semantics + hit-area sync | rewrite | in_progress | Left/right controls, context suppression, hit-area sync |
| S2-17 | Lobby UX parity | rewrite | in_progress | New lobby overlay manager surfaces assignment/denial/release runtime state |
| S2-19 | Chat UX parity | rewrite | in_progress | New chat overlay manager renders history/rate-limit and sends team/global chat requests |
| S2-20 | Help modal parity | rewrite | in_progress | New help modal (`F1`) now renders control reference overlay parity slice |
| S2-21 | Map modal parity | rewrite | in_progress | New map modal (`F2`) now renders city/assignment/world telemetry parity slice |
| S2-22 | Options modal parity | rewrite | in_progress | New options modal (`F3`) now controls HUD visibility and overlay opacity parity slice |
| S2-28 | Fullscreen/resize/ui interaction parity | rewrite | in_progress | Window/fullscreen lifecycle service wired |
| S2-* (remaining) | Client gameplay/UI parity set | rewrite | deferred | Modal/audio/radar/tutorial/build-menu full parity pending |
| S4-01 | Layer-composed domain services | rewrite | in_progress | Runtime bootstrap composed through `RuntimeLayer` |
| S4-02 | Typed domain errors/rejections | rewrite | done | Domain ADT + centralized rejection mapping |
| S4-03 | Event ingress queue/backpressure | rewrite | done | Queue ingress active |
| S4-04 | Deterministic schedulers | rewrite | done | Effect-driven tick scheduler active |
| S4-05 | Ref/SynchronizedRef state | rewrite | done | Runtime state behind `Ref` |
| S4-06 | Structured observability | rewrite | done | Runtime/client structured logging now covers socket lifecycle and decode failure paths |
| S4-07 | Lifecycle scopes | rewrite | done | Runtime resources managed by scope abstraction |
| S4-08 | Effect adapters (auth/discord/persistence) | rewrite | done | Persistence/discord adapters exercised by authority flows |
| S5-01,S5-02,S5-03,S5-04,S5-06 | Server parity matrix ports | rewrite | in_progress | Server authority regressions continuously expanded |
| S5-07 | Client collision/movement tests | rewrite | in_progress | Sim-core + client movement parity tests active |
| S5-09 | Client UI/network parity tests | rewrite | in_progress | Ingress canonicalization + handler inventory + lobby/chat/help/map/options modal helper tests added |
| S5-12 | CI parity gate tightening | rewrite | done | Added `typecheck` gates to both GitHub and GitLab pipelines |
| S5-* (remaining) | Test matrix + CI parity gates | rewrite | deferred | Remaining legacy feature/UI behavior porting tracked explicitly |

## Exit Criteria Tracking
- S0: done
- S1: done
- S3: in_progress
- S2: in_progress
- S4: in_progress
- S5: in_progress

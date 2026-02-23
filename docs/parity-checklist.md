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
| S0-03 | Acceptance criteria by subsystem | rewrite | done | Stage criteria tracked/validated |
| S1-01..S1-26 | Authoritative server gameplay domains | rewrite | done | Core authority parity landed with coverage |
| S3-01 | Full gameplay schemas | rewrite | done | Implemented gameplay protocol surface is schema-complete |
| S3-02 | `:` vs `.` compatibility | rewrite | done | Canonical emit + alias ingress normalization |
| S3-03 | Server dispatch expansion | rewrite | done | Dispatch inventory test-asserted |
| S3-04 | Client apply handler expansion | rewrite | done | Apply inventory test-asserted |
| S3-05 | Envelope versioning policy | rewrite | done | Versioning and compatibility policy maintained |
| S2-01 | Client event handling surface | rewrite | done | Typed decode/canonicalization boundary active |
| S2-02 | Core movement + unstick + nearest-safe fallback | rewrite | done | Collision-aware movement with safe fallback |
| S2-03 | Client collision helpers parity | rewrite | done | Helper modules landed/tested |
| S2-04 | Building placement client rules + sync behavior | rewrite | done | Pointer-targeted placement/demolish and selected build type active |
| S2-05 | Inventory icon stack/select/arm/drop semantics | rewrite | deferred | Full legacy inventory UX not yet ported |
| S2-06 | Items/hazards lifecycle on client | rewrite | in_progress | Hazard visuals active; full item parity pending |
| S2-07 | Bullet client visuals/semantics parity | rewrite | done | Type-aware bullet stepping/render lifecycle active |
| S2-08 | Draw panel + finance + inventory + radar | rewrite | done | HUD telemetry plus map modal radar projection active |
| S2-09 | Build menu UI and ghost placement | rewrite | done | Overlay/hotkeys/ghost placement active |
| S2-10 | Item drawing priorities and hidden enemy mines | rewrite | deferred | Legacy visual rules pending |
| S2-11 | Ground/tile/changing layer rendering | rewrite | deferred | Full legacy layer stack pending |
| S2-12 | Name labels rank/callsign/city rendering | rewrite | deferred | Dedicated renderer pending |
| S2-13 | Muzzle flash + floating points + camera shake | rewrite | deferred | Visual FX parity pending |
| S2-14 | Client map loader/orientation behavior | rewrite | deferred | Client loader parity pending (server loader done) |
| S2-15 | Full keyboard semantics | rewrite | done | Legacy-friendly aliases active |
| S2-16 | Mouse semantics + hit-area sync | rewrite | done | Mouse/runtime hit-area behavior parity slice active |
| S2-17 | Lobby UX parity | rewrite | done | Runtime overlay manager wired |
| S2-18 | Identity UX parity | rewrite | deferred | Full identity UI flow intentionally staged |
| S2-19 | Chat UX parity | rewrite | done | Chat overlay send/history/rate-limit semantics active |
| S2-20 | Help modal parity | rewrite | done | `F1` modal parity slice active |
| S2-21 | Map modal parity | rewrite | done | `F2` modal parity slice with radar |
| S2-22 | Options modal parity | rewrite | done | `F3` options with HUD/audio/tutorial/opacity controls |
| S2-23 | Tutorial/training flow parity | rewrite | done | Tutorial manager + `T` toggle active |
| S2-24 | Intro/start flow parity | rewrite | done | Intro modal + start controls active |
| S2-25 | Rogue tank gameplay client parity | rewrite | deferred | Full client rogue UX/debug pending |
| S2-26 | Defender bot debug/pathing parity | rewrite | deferred | Client debug layer pending |
| S2-27 | Audio/music loop parity | rewrite | done | Runtime audio/music hooks active |
| S2-28 | Fullscreen/resize/ui interaction parity | rewrite | done | Window/fullscreen service active |
| S2-29 | Force-draw optimization semantics | rewrite | done | Dirty-flag rendering integrated for overlays/HUD |
| S2-30 | Asset parity (sprites/map/audio) | rewrite | deferred | Full manifest/sprite/audio parity pending |
| S4-01 | Layer-composed domain services | rewrite | done | Runtime bootstrap through `RuntimeLayer` |
| S4-02 | Typed domain errors/rejections | rewrite | done | Domain ADT + rejection mapping active |
| S4-03 | Event ingress queue/backpressure | rewrite | done | Queue ingress active |
| S4-04 | Deterministic schedulers | rewrite | done | Effect tick scheduler active |
| S4-05 | Ref/SynchronizedRef state | rewrite | done | Runtime state behind `Ref` |
| S4-06 | Structured observability | rewrite | done | Runtime/client structured logging active |
| S4-07 | Lifecycle scopes | rewrite | done | Runtime resources managed by scope abstraction |
| S4-08 | Effect adapters (auth/discord/persistence) | rewrite | done | Adapters exercised by authoritative flows |
| S5-01..S5-06 | Server parity matrix ports | rewrite | in_progress | Expanded server authority suites active |
| S5-07 | Client collision/movement tests | rewrite | done | Sim-core + client movement parity tests active |
| S5-08 | Client item/icon/bullet behavior tests | rewrite | done | Item/bullet/build-menu/ghost/intents tests active |
| S5-09 | Client UI/network parity tests | rewrite | done | Router and UI modal/lobby/chat/tutorial coverage active |
| S5-10 | Benchmark/serialization coverage | rewrite | deferred | Legacy benchmark ports pending |
| S5-11 | Behavior scenario parity | rewrite | deferred | Cucumber/behavior ports pending |
| S5-12 | CI parity gate tightening | rewrite | done | CI includes lint/typecheck/test/strict |

## Exit Criteria Tracking
- S0: done
- S1: done
- S3: done
- S2: in_progress
- S4: done
- S5: in_progress

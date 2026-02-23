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
| S2-01..S2-04 | Input/network/core movement/build interactions | rewrite | done | Typed ingress + collision + placement parity active |
| S2-05 | Inventory icon stack/select/arm/drop semantics | rewrite | done | `IconInventoryService` + intent wiring landed |
| S2-06 | Items/hazards lifecycle on client | rewrite | done | Item/hazard world state render+apply lifecycle active |
| S2-07 | Bullet client visuals/semantics parity | rewrite | done | Type-aware bullet stepping/render lifecycle active |
| S2-08 | Draw panel + finance + inventory + radar | rewrite | done | HUD telemetry + map radar + city layout snapshot active |
| S2-09 | Build menu UI and ghost placement | rewrite | done | Overlay/hotkeys/ghost placement active |
| S2-10 | Item drawing priorities + hidden enemy mines | rewrite | done | `ItemRenderer` enforces ordering and mine visibility rules |
| S2-11 | Ground/tile/changing layer rendering | rewrite | done | Layered world renderers integrated in scene runtime |
| S2-12 | Name labels rank/callsign/city rendering | rewrite | done | `NameLabelRenderer` parity slice active |
| S2-13 | Muzzle flash + floating points + camera shake | rewrite | done | Effects renderer provides shot flash, shake, and event cues |
| S2-14 | Client map loader/orientation behavior | rewrite | done | `map-loader` + `city-layout` parity modules active |
| S2-15 | Full keyboard semantics | rewrite | done | Legacy-friendly aliases active |
| S2-16 | Mouse semantics + hit-area sync | rewrite | done | Mouse/runtime hit-area behavior parity slice active |
| S2-17 | Lobby UX parity | rewrite | done | Runtime overlay manager wired |
| S2-18 | Identity UX parity | rewrite | done | Identity panel + persisted user/callsign + local/google mode toggle |
| S2-19 | Chat UX parity | rewrite | done | Chat overlay send/history/rate-limit semantics active |
| S2-20 | Help modal parity | rewrite | done | `F1` modal parity slice active |
| S2-21 | Map modal parity | rewrite | done | `F2` modal parity slice with radar + layout snapshot |
| S2-22 | Options modal parity | rewrite | done | `F3` options with HUD/audio/tutorial/identity/debug controls |
| S2-23 | Tutorial/training flow parity | rewrite | done | Tutorial manager + `T` toggle active |
| S2-24 | Intro/start flow parity | rewrite | done | Intro modal + start controls active |
| S2-25 | Rogue tank gameplay client parity | rewrite | done | Hostile rogue telemetry/service slice active in HUD |
| S2-26 | Defender bot debug/pathing parity | rewrite | done | Debug overlay + defender summaries active |
| S2-27 | Audio/music loop parity | rewrite | done | Runtime audio/music hooks active |
| S2-28 | Fullscreen/resize/ui interaction parity | rewrite | done | Window/fullscreen service active |
| S2-29 | Force-draw optimization semantics | rewrite | done | Dirty-flag rendering integrated for overlays/HUD |
| S2-30 | Asset parity (sprites/map/audio) | rewrite | done | Asset manifest + client map asset baseline landed |
| S4-01..S4-08 | Effect architecture hardening | rewrite | done | Layered runtime, typed errors, ingress queue, scheduler, refs, observability, scopes, adapters |
| S5-01..S5-06 | Server parity matrix ports | rewrite | done | Server authority suites cover building/research/hazard/orb/lobby/inventory/security parity |
| S5-07 | Client collision/movement tests | rewrite | done | Sim-core + client movement parity tests active |
| S5-08 | Client item/icon/bullet behavior tests | rewrite | done | Item/bullet/build-menu/ghost/intents tests active |
| S5-09 | Client UI/network parity tests | rewrite | done | Router and UI modal/lobby/chat/tutorial coverage active |
| S5-10 | Benchmark/serialization coverage | rewrite | done | Added protocol/server/client serialization benchmark smoke suites |
| S5-11 | Behavior scenario parity | rewrite | done | Added server behavior parity scenarios (`behavior-parity.test.ts`) |
| S5-12 | CI parity gate tightening | rewrite | done | CI includes lint/typecheck/test/strict |

## Exit Criteria Tracking
- S0: done
- S1: done
- S3: done
- S2: done
- S4: done
- S5: done

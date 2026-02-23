# Rewrite Progress

## Current Stage
- `S2` checkpoint after landing intro/tutorial/audio parity slices, radar/map overlay expansion, and force-draw dirty-flag rendering semantics.

## S-ID Status Ledger
| S-ID | Status | Notes |
|---|---|---|
| S0-01 | done | Contract inventory maintained in gap docs/checklist |
| S0-02 | done | Event parity matrix maintained with canonical/legacy mappings |
| S0-03 | done | Acceptance criteria retained and stage-gated |
| S1-01..S1-26 | done | Authoritative lobby/economy/research/buildings/factories/hazards/defense/orb/score/security/fake-city/bots/map/adapters implemented and regression-covered |
| S3-01 | done | Protocol schemas now cover the full implemented gameplay/runtime contract |
| S3-02 | done | `:` ingress aliases normalized centrally with canonical `.` egress |
| S3-03 | done | Server dispatch inventory explicit and test-locked |
| S3-04 | done | Client apply inventory explicit and test-locked |
| S3-05 | done | Versioning/compatibility strategy documented and current |
| S2-01 | done | Typed decode/canonicalization boundary before apply |
| S2-02 | done | Collision-aware movement + unstick fallback |
| S2-03 | done | Client collision helper modules landed |
| S2-04 | done | Pointer-targeted build/demolish intents with selected build type |
| S2-05 | deferred | Full legacy icon stack/arming/drop UX not yet ported; authoritative inventory parity remains done server-side |
| S2-06 | in_progress | Hazard lifecycle visuals are active; full item visual parity remains staged |
| S2-07 | done | Loop-time bullet stepping + type-aware speed mapping wired |
| S2-08 | done | HUD + primitive world telemetry parity active |
| S2-09 | done | Build menu + hotkey selection + ghost placement preview active |
| S2-10 | deferred | Item render priority + hidden enemy mine visual rules pending |
| S2-11 | deferred | Full tile/ground/changing-layer rendering parity pending |
| S2-12 | deferred | Rank/callsign/city name-label renderer parity pending |
| S2-13 | deferred | Muzzle flash/floating points/camera shake pending |
| S2-14 | deferred | Client map/layout loader parity pending (server loader parity is done) |
| S2-15 | done | Legacy-friendly keyboard aliases active |
| S2-16 | done | Mouse controls, context suppression, and hit-area sync active |
| S2-17 | done | Lobby overlay manager mirrors assignment/denial/release |
| S2-18 | deferred | Full identity UX (Google/local) intentionally deferred |
| S2-19 | done | Chat overlay parity slice with history/rate-limit/send semantics |
| S2-20 | done | Help modal (`F1`) parity slice |
| S2-21 | done | Map modal (`F2`) parity slice with radar projection |
| S2-22 | done | Options modal (`F3`) with HUD/overlay/audio/tutorial toggles |
| S2-23 | done | Tutorial manager runtime parity slice (`T`) |
| S2-24 | done | Intro/start modal parity slice (Enter/Escape start flow) |
| S2-25 | deferred | Full rogue tank client UX/debug parity pending (server authority done) |
| S2-26 | deferred | Defender client debug/pathing overlay parity pending |
| S2-27 | done | Audio/music hook services wired to runtime loop |
| S2-28 | done | Resize/fullscreen lifecycle service active |
| S2-29 | done | Dirty-flag force-draw semantics active across overlays/HUD |
| S2-30 | deferred | Full legacy sprite/audio asset manifest parity pending |
| S4-01 | done | Runtime domain composition through `RuntimeLayer` remains canonical |
| S4-02..S4-08 | done | Typed errors, queue ingress, scheduler, refs, observability, scopes, adapters all active |
| S5-01..S5-06 | in_progress | Server parity matrix continues expanding (core authority domains covered in runtime tests) |
| S5-07 | done | Client/sim-core movement collision parity tests active |
| S5-08 | done | Item/bullet/build-menu/ghost/intents parity tests active |
| S5-09 | done | Client UI/router/modal parity tests expanded (intro/tutorial/options/map/help/chat/lobby) |
| S5-10 | deferred | Benchmark/serialization parity ports pending |
| S5-11 | deferred | Legacy cucumber scenario parity ports pending |
| S5-12 | done | CI parity gates include `typecheck` + strict checks |

## Exact Files Changed In This Delivery
- `apps/client-ts/src/app/state.ts`
- `apps/client-ts/src/audio/AudioManager.ts`
- `apps/client-ts/src/audio/MusicManager.ts`
- `apps/client-ts/src/main.ts`
- `apps/client-ts/src/render/dirty-flags.ts`
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/src/ui/build-menu/BuildMenu.ts`
- `apps/client-ts/src/ui/chat/ChatManager.ts`
- `apps/client-ts/src/ui/help/HelpModal.ts`
- `apps/client-ts/src/ui/intro/IntroModal.ts`
- `apps/client-ts/src/ui/lobby/LobbyManager.ts`
- `apps/client-ts/src/ui/map/MapModal.ts`
- `apps/client-ts/src/ui/modals/ModalHotkeys.ts`
- `apps/client-ts/src/ui/options/OptionsModal.ts`
- `apps/client-ts/src/ui/tutorial/TutorialManager.ts`
- `apps/client-ts/test/audio-manager.test.ts`
- `apps/client-ts/test/dirty-flags.test.ts`
- `apps/client-ts/test/help-map-modal.test.ts`
- `apps/client-ts/test/intro-tutorial.test.ts`
- `apps/client-ts/test/modal-hotkeys.test.ts`
- `apps/client-ts/test/options-modal.test.ts`
- `docs/event-versioning.md`
- `docs/parity-acceptance-criteria.md`
- `docs/parity-checklist.md`
- `docs/rewrite-progress.md`
- `docs/typescript-gap-analysis.md`
- `docs/typescript-gap-mapping.md`

## Validation Results
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run test`: pass
- `npm run rewrite:check:strict`: pass

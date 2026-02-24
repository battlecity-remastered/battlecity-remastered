# Rewrite Progress

## Current Stage
- `S5` final closure checkpoint: parity docs normalized, staged ledger closed (`done` across `S0..S5`), and strict validation reconfirmed on `2026-02-23` against current HEAD at validation time.

## S-ID Status Ledger
| S-ID | Status | Notes |
|---|---|---|
| S0-01 | done | Contract inventory maintained in gap docs/checklist |
| S0-02 | done | Event parity matrix maintained with canonical/legacy mappings |
| S0-03 | done | Acceptance criteria retained and stage-gated |
| S1-01..S1-26 | done | Authoritative lobby/economy/research/buildings/factories/hazards/defense/orb/score/security/fake-city/bots/map/adapters implemented and regression-covered |
| S3-01 | done | Protocol schemas cover implemented gameplay/runtime contract |
| S3-02 | done | `:` ingress aliases normalized centrally with canonical `.` egress |
| S3-03 | done | Server dispatch inventory explicit and test-locked |
| S3-04 | done | Client apply inventory explicit and test-locked |
| S3-05 | done | Versioning/compatibility strategy documented and current |
| S2-01..S2-04 | done | Typed ingress/apply, movement+collision, and build/demolish parity slices active |
| S2-05 | done | Client inventory icon selection/arming/drop semantics landed in `IconInventoryService` + intent wiring |
| S2-06 | done | Client item/hazard lifecycle visuals and application parity active |
| S2-07..S2-09 | done | Bullet lifecycle, HUD telemetry, build menu + ghost placement parity active |
| S2-10 | done | Item renderer enforces priority ordering and hidden enemy mine visibility rules |
| S2-11 | done | Ground/tile/changing layer rendering modules integrated in scene runtime |
| S2-12 | done | Name-label renderer parity slice active with rank/callsign/city formatting |
| S2-13 | done | Muzzle flash + camera shake + event FX renderer integrated |
| S2-14 | done | Client map orientation loader and city-layout snapshot parity slices active |
| S2-15..S2-17 | done | Keyboard/mouse/lobby UX parity slices active |
| S2-18 | done | Identity UX manager with local/google mode toggle + persisted callsign/user binding active |
| S2-19..S2-24 | done | Chat/help/map/options/tutorial/intro parity slices active |
| S2-25 | done | Rogue client parity slice via hostile summary telemetry and HUD integration |
| S2-26 | done | Defender debug/pathing parity slice via bot debug overlay + summaries |
| S2-27..S2-29 | done | Audio/window/dirty-flag parity slices active |
| S2-30 | done | Asset manifest + client `map.dat` parity asset baseline added |
| S4-01..S4-08 | done | Layer composition, typed errors, ingress queue, scheduler, refs, observability, scopes, adapters all active |
| S5-01..S5-06 | done | Server parity suites cover building/research/hazard/orb/lobby/inventory/security authority paths |
| S5-07 | done | Client/sim-core movement collision parity tests active |
| S5-08 | done | Item/bullet/build-menu/ghost/intents parity tests active |
| S5-09 | done | Client UI/router/modal parity tests active |
| S5-10 | done | Benchmark/serialization parity smoke suites added in protocol/server/client tests |
| S5-11 | done | Behavior parity scenarios added (`behavior-parity.test.ts`) |
| S5-12 | done | CI parity gates include lint/typecheck/test/strict |

## Exact Files Changed In This Delivery
- `apps/client-ts/src/app/state.ts`
- `apps/client-ts/src/app/network-events.ts`
- `apps/client-ts/src/main.ts`
- `apps/client-ts/src/ui/orb/OrbHintBanner.ts`
- `apps/client-ts/test/network-events.test.ts`
- `apps/client-ts/test/orb-hint-banner.test.ts`
- `docs/main-branch-parity-gap-audit.md`
- `docs/rewrite-progress.md`

## Validation Results
- `npm run typecheck --workspace @battlecity/client-ts`: pass (2026-02-24)
- `npm run test --workspace @battlecity/client-ts`: pass (2026-02-24, 74/74)

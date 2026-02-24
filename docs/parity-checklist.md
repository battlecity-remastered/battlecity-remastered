# Visual Parity Checklist

Last updated: 2026-02-24

## Phase Progress
- [x] Phase 0 - Baseline + harness
- [x] Phase 1 - Shared constants + item IDs
- [x] Phase 2 - Asset loading parity
- [x] Phase 3 - Map decode + blocking parity
- [x] Phase 4 - Ground + terrain tile parity
- [x] Phase 5 - Building base + overlays parity
- [x] Phase 6 - Population/research/smoke/digits parity
- [x] Phase 7 - Items/defense/bullets parity
- [x] Phase 8 - Panel + radar + home arrow parity
- [x] Phase 9 - Map modal parity
- [ ] Phase 10 - City spawn/layout parity
- [ ] Phase 11 - End-to-end parity validation

## A) Shared constants + IDs
- [x] All item IDs match legacy (`cloak=0 ... laser=12`).
- [x] No local duplicate item ID constants in render/input/intents.
- [x] Panel/radar constants imported from one parity constants module.

## B) Assets
- [x] `LegacyTextureRegistry` loads all required parity textures.
- [x] `imgMiniMapColors` available for radar dead marker.
- [x] `imgTurretHead` available for defense heads.
- [x] `imgInventorySelection` used by panel inventory UI.
- [x] `imgMoneyBox` used in panel finance block.
- [ ] `imgBlackNumbers` used for factory item digits.
- [ ] `imgLExplosion` available and used for large explosions.

## C) Map and terrain
- [x] Client map decode orientation matches legacy axis transform.
- [x] Server map decode orientation matches client.
- [x] Client and server blocking logic is explicitly aligned.
- [x] Ground layer uses tile size `128` and modulo camera alignment.
- [x] Terrain frame bitmasking produces correct `frameX = mask * 48`.
- [x] Out-of-bounds terrain tiles render black.

## D) Buildings
- [x] Building base frame uses `(0, baseType*144, 144, 144)`.
- [x] Building animation parity (`animX=144`, `animCountX=3`, cadence parity).
- [x] Factory overlay icon at `(+56,+52)`.
- [x] Research overlay icon at `(+14,+98)`.
- [x] Research vertical strip crop/scale/position parity.
- [x] Population frame row/column parity.
- [x] Population offsets per family parity.
- [x] Factory smoke position parity.
- [x] Factory digit placement parity.
- [x] Command center world label center and y-offset parity.

## E) Defenses / items / bullets
- [x] Turret base damage column parity.
- [x] Turret head orientation frame parity.
- [x] Mine frame/offset parity.
- [x] Bomb idle/armed frame parity.
- [x] Orb animation frame and x-offset parity.
- [x] Mine/wall draw order parity.
- [x] Bullet 8x8 row/column animation parity.

## F) Tanks
- [ ] Local tank row/column parity.
- [ ] Remote tank row/column parity.
- [ ] Tank position formula parity.
- [ ] No center-anchor drift.

## G) Panel
- [x] Top panel at `(maxMapX,0)`.
- [x] Bottom panel fixed at `(maxMapX,430)`.
- [x] Finance icons/text coordinates parity.
- [x] Health bar sprite/mask coordinates parity.
- [x] Panel message base coordinate parity.
- [x] Inventory grid slot coordinates parity.
- [x] Selection highlight and quantity text parity.
- [x] Home arrow coordinates + frame selection parity.

## H) Radar
- [x] Uses legacy relative projection formula (not world normalization).
- [x] Uses legacy range clamp `2400`.
- [x] Uses radar bounds clipping (`138x138` at offset `(28,8)`).
- [x] Uses texture slices from radar/minimap color textures.

## I) Map modal
- [x] Canvas-based full map render.
- [x] Tile coloring by terrain value parity.
- [x] Structure markers centered on footprints.
- [x] City markers and labels present.
- [x] Player center marker parity.
- [x] Escape/overlay/fullscreen close behavior parity.

## J) Spawn/layout
- [ ] Client spawn data covers full city range (`0..63`).
- [ ] Final row shifted x-coordinates preserved exactly.
- [ ] Player spawn pixel formula parity from tile coords.
- [ ] `.city` import transform parity.

## K) Validation
- [ ] All added parity tests pass.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes.
- [ ] `npm run rewrite:check:strict` passes.
- [ ] Manual parity spot-check completed at `1024x768`.

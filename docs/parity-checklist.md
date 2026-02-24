# Visual Parity Checklist

Last updated: 2026-02-24

## Phase Progress
- [x] Phase 0 - Baseline + harness
- [x] Phase 1 - Shared constants + item IDs
- [ ] Phase 2 - Asset loading parity
- [ ] Phase 3 - Map decode + blocking parity
- [ ] Phase 4 - Ground + terrain tile parity
- [ ] Phase 5 - Building base + overlays parity
- [ ] Phase 6 - Population/research/smoke/digits parity
- [ ] Phase 7 - Items/defense/bullets parity
- [ ] Phase 8 - Panel + radar + home arrow parity
- [ ] Phase 9 - Map modal parity
- [ ] Phase 10 - City spawn/layout parity
- [ ] Phase 11 - End-to-end parity validation

## A) Shared constants + IDs
- [x] All item IDs match legacy (`cloak=0 ... laser=12`).
- [x] No local duplicate item ID constants in render/input/intents.
- [x] Panel/radar constants imported from one parity constants module.

## B) Assets
- [ ] `LegacyTextureRegistry` loads all required parity textures.
- [ ] `imgMiniMapColors` available for radar dead marker.
- [ ] `imgTurretHead` available for defense heads.
- [ ] `imgInventorySelection` used by panel inventory UI.
- [ ] `imgMoneyBox` used in panel finance block.
- [ ] `imgBlackNumbers` used for factory item digits.
- [ ] `imgLExplosion` available and used for large explosions.

## C) Map and terrain
- [ ] Client map decode orientation matches legacy axis transform.
- [ ] Server map decode orientation matches client.
- [ ] Client and server blocking logic is explicitly aligned.
- [ ] Ground layer uses tile size `128` and modulo camera alignment.
- [ ] Terrain frame bitmasking produces correct `frameX = mask * 48`.
- [ ] Out-of-bounds terrain tiles render black.

## D) Buildings
- [ ] Building base frame uses `(0, baseType*144, 144, 144)`.
- [ ] Building animation parity (`animX=144`, `animCountX=3`, cadence parity).
- [ ] Factory overlay icon at `(+56,+52)`.
- [ ] Research overlay icon at `(+14,+98)`.
- [ ] Research vertical strip crop/scale/position parity.
- [ ] Population frame row/column parity.
- [ ] Population offsets per family parity.
- [ ] Factory smoke position parity.
- [ ] Factory digit placement parity.
- [ ] Command center world label center and y-offset parity.

## E) Defenses / items / bullets
- [ ] Turret base damage column parity.
- [ ] Turret head orientation frame parity.
- [ ] Mine frame/offset parity.
- [ ] Bomb idle/armed frame parity.
- [ ] Orb animation frame and x-offset parity.
- [ ] Mine/wall draw order parity.
- [ ] Bullet 8x8 row/column animation parity.

## F) Tanks
- [ ] Local tank row/column parity.
- [ ] Remote tank row/column parity.
- [ ] Tank position formula parity.
- [ ] No center-anchor drift.

## G) Panel
- [ ] Top panel at `(maxMapX,0)`.
- [ ] Bottom panel fixed at `(maxMapX,430)`.
- [ ] Finance icons/text coordinates parity.
- [ ] Health bar sprite/mask coordinates parity.
- [ ] Panel message base coordinate parity.
- [ ] Inventory grid slot coordinates parity.
- [ ] Selection highlight and quantity text parity.
- [ ] Home arrow coordinates + frame selection parity.

## H) Radar
- [ ] Uses legacy relative projection formula (not world normalization).
- [ ] Uses legacy range clamp `2400`.
- [ ] Uses radar bounds clipping (`138x138` at offset `(28,8)`).
- [ ] Uses texture slices from radar/minimap color textures.

## I) Map modal
- [ ] Canvas-based full map render.
- [ ] Tile coloring by terrain value parity.
- [ ] Structure markers centered on footprints.
- [ ] City markers and labels present.
- [ ] Player center marker parity.
- [ ] Escape/overlay/fullscreen close behavior parity.

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

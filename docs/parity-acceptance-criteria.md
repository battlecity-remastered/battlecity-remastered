# Parity Acceptance Criteria

Last updated: 2026-02-24

## Scope
This defines objective acceptance for visual parity between legacy `master` and TypeScript client/server for UI, map, terrain, and building rendering.

## Hard acceptance requirements

## 1) Build and quality
1. `npm run typecheck` passes.
2. `npm run test` passes.
3. `npm run rewrite:check:strict` passes.

## 2) Panel geometry at `1024x768`
1. World width is `824`, panel width `200`.
2. Top panel starts at `(824,0)`.
3. Bottom panel starts at `(824,430)`.
4. Money box `(826,224)`, icon `(832,225)`, cash text `(848,226)`.
5. Health sprite anchor is bottom-right and positioned at `(999,247)`.
6. Panel message block starts at `(836,465)`.

## 3) Radar behavior
1. Radar bounds rectangle is `x=[852..990], y=[8..146]`.
2. Radar range clamp is `2400 px` from local player.
3. Projection formula uses `(dx-70)/24`, `(dy-69)/24`.
4. Dead markers use `imgMiniMapColors` column 15 texture slice.

## 4) Terrain and map
1. Map decode transform is `sourceX=511-y`, `sourceY=511-x`.
2. Terrain adjacency bitmask frame selection produces expected 16 cases.
3. Ground layer uses tile size `128` and modulo camera alignment.
4. Out-of-bounds terrain tiles draw black.
5. Client/server blocking rules are identical for the same map bytes.

## 5) Building visuals
1. Base frame rect is `(0, baseType*144, 144, 144)`.
2. Building animation cycles 3 columns with parity cadence.
3. Research icon appears at `(+14,+98)` for research buildings.
4. Factory icon appears at `(+56,+52)` for factories.
5. Research side strip crop/scale/position matches parity formula.
6. Population frame row/column and per-family offsets match parity matrix.
7. Factory smoke frame and position match parity.
8. Factory digits draw from `imgBlackNumbers` at correct offsets.
9. Command center labels render at world center with `-32` y offset.

## 6) Items/defenses/bullets
1. Turret base damage columns and turret head orientation frames match.
2. Mine uses `32x32` frame with `+8,+8` offset.
3. Bomb armed frame uses `(144,91,48,48)`.
4. Orb uses animated row frame and `+4` x offset.
5. Mine/wall ordering matches legacy (mine first, wall over mine).
6. Bullets use animated `8x8` frames by row/type.

## 7) Tanks
1. Local tank at viewport center of world area.
2. Remote tank positions follow world transform formula.
3. No anchor-based drift relative to legacy placement.
4. Row selection (ally/enemy, mayor/recruit) matches legacy.

## 8) Map modal
1. Modal is canvas-based full map overlay.
2. Terrain color mapping matches legacy palette.
3. Building markers, city markers, and player marker are present.
4. Escape/overlay click/fullscreen transitions behave correctly.

## 9) Spawn and layout
1. Client spawn resolver supports all city IDs `0..63`.
2. Spawn tile coordinates match `apps/server-ts/data/citySpawns.json` exactly.
3. `.city` import transform and type conversion parity validated by tests.

## Final acceptance decision
Accepted only if all hard requirements pass and `docs/parity-checklist.md` is fully checked.

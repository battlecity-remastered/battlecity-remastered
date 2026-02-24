# Main/Master Parity Gap Audit (Categorical)

## Baseline and Method
- Requested comparison target: `main`.
- Repository reality at audit time (2026-02-24): no local `main` branch exists, so this audit uses `master` (same legacy runtime lineage) as the source of truth.
- Legacy reference inspected from git objects: `master` (`client/` + `server/`).
- TS target inspected in current worktree: `apps/client-ts`, `apps/server-ts`, `packages/protocol`, `packages/sim-core`.
- This document is intentionally conservative: items are marked missing when legacy behavior/assets are visible in `master` but no equivalent runtime implementation is present in TS.

## Executive Summary
Current TS runtime is functionally test-covered in many areas, but **visual/UI parity with legacy is not complete**.
The largest hard gap is the **asset + sprite rendering pipeline**: legacy client shipped a large art/audio set and texture-driven rendering, while TS currently runs mostly primitive `Graphics` rendering with placeholder asset root.

## Evidence Snapshots
- Legacy bootstrap and texture pipeline: `master:client/app.js`.
- Legacy HTML shell: `master:client/index.html`.
- Legacy asset tree: `master:client/data/*`.
- Legacy render modules: `master:client/src/draw/*`, `master:client/src/effects/*`, `master:client/src/factories/*`.
- TS bootstrap and scene: `apps/client-ts/src/main.ts`, `apps/client-ts/src/render/scene.ts`.
- TS asset manifest: `apps/client-ts/src/assets/manifest.ts`.
- TS runtime asset root contents: `apps/client-ts/public/assets/` (currently only `map.dat` + `README.txt`).

---

## A. Asset and Resource Parity

### A1. Missing asset corpus in TS public runtime
Status: `missing`

Legacy `client/data` includes extensive runtime assets (sprites, UI atlases, fonts, wav/music/midi, skins, city layouts). TS public asset root currently contains only:
- `map.dat`
- `README.txt`

Critical missing groups (legacy examples):
- Tank/building/item sprites: `imgTanks.png`, `imgBuildings.png`, `imgItems.png`, `imgbullets.png`.
- Terrain/interface atlases: `imgGround.png`, `imgRocks.png`, `imgLava.png`, `imgInterface.png`, `imgInterfaceBottom.png`, `imgRadarColors.png`, `imgMiniMapColors.png`.
- Effects sprites: `imgMuzzleFlash.png`, `imgSExplosion.png`, `imgLExplosion.png`, `imgSmoke.png`.
- UI/icon atlases: `imgBuildIcons.png`, `imgInventorySelection.png`, `imgArrows.png`, `imgDemolish.png`, `imgCursor.png`, `imgHealth.png`, `imgPopulation.png`, `imgMoney*.png`.
- Audio packs: `wav/`, `music/`, plus wav files such as `cloak.wav`, `flare.wav`.
- Fonts/branding: `Vera.ttf`, logos, favicon variants.
- Skin-specific resources: `skins/BattleCityDX/...`.

### A2. TS manifest references unresolved files
Status: `missing`

`apps/client-ts/src/assets/manifest.ts` references:
- `/assets/tankTexture.png`
- `/assets/imageItems.png`
- `/assets/buildings.png`
- `/assets/music-loop.mp3`
- `/assets/sfx-laser.mp3`
- `/assets/sfx-orb.mp3`

These files are not present in `apps/client-ts/public/assets/` at audit time.

### A3. No active texture loader path in TS client runtime
Status: `missing`

Legacy loads and assigns many textures (`PIXI.Assets.load`, then `game.textures[...]`).
TS runtime currently does not load sprite sheets into render services and does not bind `Texture` assets for core entities.

---

## B. Rendering Pipeline Parity

### B1. Tank rendering is not sprite-atlas parity
Status: `partial`

Legacy:
- Directional tank frames from atlas rows/columns (`imgTanks`), role/city-aware row selection, cloaking/name-label rules.

TS:
- Tanks drawn as procedural `Graphics` silhouettes in `render/scene.ts`.
- No atlas-frame sampling, no per-skin rows, no legacy directional frame parity.

### B2. Terrain rendering is not texture/parity-tiling equivalent
Status: `partial`

Legacy:
- Ground texture tiling (`imgGround`).
- Rock/lava autotile frame selection from precomputed tile map in `draw-tiles.js`.

TS:
- Procedural color fills in `GroundLayer.ts` / `TileLayer.ts`.
- No legacy texture atlas use or equivalent autotile visual fidelity.

### B3. Building rendering lacks legacy overlays/animations
Status: `partial`

Legacy `draw-tiles.js` includes:
- Animated building tiles.
- Research bar icon state (`imgResearch`/`imgResearchComplete`).
- Building-type icon overlays.
- Population overlays.
- Factory smoke overlays.
- Command-center label system.

TS:
- Simple geometric building sprites; no atlas-based overlays/animation parity.

### B4. Item/hazard rendering lacks sprite-frame parity
Status: `partial`

Legacy `draw-items.js` includes per-type frame logic (turret base/head orientation, mine concealment rules, bomb armed frame, orb animation frames, wall ordering).
TS `ItemRenderer.ts` uses circles/colors only.

### B5. Effects rendering lacks legacy sprite FX parity
Status: `partial`

Legacy has sprite-based muzzle flash, floating points, small/large explosions, smoke, camera shake integration.
TS has reduced effect primitives and no sprite atlas FX pipeline parity.

### B6. Panel/radar visual system is not equivalent
Status: `partial`

Legacy `draw-panel-interface.js` provides textured panel chrome, radar textures, home-arrow, health bar sprites, money/pop/research indicators, and interactive panel buttons.
TS uses text HUD and modal text overlays with no texture-based panel composition.

---

## C. UI/UX Surface Parity

### C1. HTML shell parity is not equivalent
Status: `partial`

Legacy `client/index.html` includes full-screen game shell, CSS styling baseline, icon wiring, `#game` container semantics.
TS `apps/client-ts/index.html` is minimal bootstrap only.

### C2. Lobby UX parity is reduced
Status: `partial`

Legacy `LobbyManager.js` has richer lobby system:
- City filtering
- Tabs/high scores
- Identity integration and Google flow wiring
- Rich overlay lifecycle/status states

TS lobby manager is simplified textual overlay.

### C3. Build UI parity is reduced
Status: `partial`

Legacy build interface supports:
- Dynamic build availability from city/research state
- Pending-research menu affordances
- Sprite icons and demolish cursor modes
- Ghost sprite behavior tied to interaction layer

TS build menu currently uses static entries and simplified ghost placement.

### C4. Options modal parity is reduced
Status: `partial`

Legacy options modal includes richer DOM UI and city import workflows.
TS options modal is simplified toggles-only panel.

### C5. Notification and affordance parity is reduced
Status: `partial`

Legacy includes notification manager, orb hint banner, menu toggle button, richer affordance styles and flow.
TS equivalents are reduced/no-op relative to legacy richness.

---

## D. Audio Parity

### D1. Audio asset parity missing
Status: `missing`

Legacy references many concrete audio resources and event-linked SFX/music behavior.
TS audio managers are present but use simplified runtime behavior and currently lack legacy asset pack integration.

### D2. Event-to-sound mapping parity reduced
Status: `partial`

Legacy has broader trigger surface (combat, orb, UI states, etc.) bound to concrete sound IDs.
TS currently covers a narrower subset.

---

## E. Input and Interaction Fidelity

### E1. Mouse interaction layer parity reduced
Status: `partial`

Legacy input path uses dedicated interaction layer semantics, cursor mode transitions, and ghost-drag handling tied to build/demolish workflows.
TS has simplified pointer model and reduced cursor/interaction semantics.

### E2. Contextual panel button interactions missing
Status: `partial`

Legacy panel has clickable staff/map/info/points/options/help/build/exit controls wired via invisible interactive regions.
TS now implements in-scene hotspots for staff/city/points/map/help/options/build/exit plus subview switching, but panel content/visual fidelity is still below legacy.

---

## F. Legacy Client Module Coverage (File-Level)

The following legacy modules have no direct feature-equivalent implementation in TS runtime (or only partial collapse):

- `client/src/draw/draw-panel-interface.js` (full textured panel/radar/button system)
- `client/src/draw/draw-icons.js` (icon atlas draw parity)
- `client/src/data/muzzleOffsets.js` (sprite muzzle offset table parity)
- `client/src/factories/BuildingFactory.js` (full client visual/state behaviors)
- `client/src/factories/IconFactory.js` (legacy icon world/inventory behaviors)
- `client/src/factories/ItemFactory.js` (legacy item lifecycle visuals)
- `client/src/factories/BulletFactory.js` (legacy bullet visual/collision client semantics)
- `client/src/ui/NotificationManager.js` (toast/notice parity)
- `client/src/utils/pixiPerformance.js` integration patterns (performance destroy scheduling details)

Note: Some behaviors may be partially represented across TS modules, but not at legacy UX/render fidelity.

---

## G. Server/Protocol Caveat (Non-visual)

Server and protocol parity docs currently mark broad closure, but from a visual/experience standpoint this does not guarantee equivalent client presentation.
This audit does not mark broad server authority systems as missing; it flags where **client-visible parity** is not yet equivalent.

---

## H. Fix Plan Backlog (Categorical, execution-ready)

1. `ASSET-01` Restore full runtime asset pack into `apps/client-ts/public/assets` (sprites, ui atlases, audio, fonts, skins). `status: done (2026-02-24)`
2. `ASSET-02` Implement real Pixi asset loader + texture registry in TS client startup. `status: done (2026-02-24)`
3. `RENDER-01` Replace procedural tank rendering with atlas frame renderer (`row/column` + role/city variants). `status: partial (2026-02-24, tank atlas rows/columns wired; full skin/frame parity pending)`
4. `RENDER-02` Port tile/autotile texture logic for ground/rocks/lava from legacy mapping. `status: partial (2026-02-24, texture-backed terrain fallback wired; full autotile parity pending)`
5. `RENDER-03` Port building overlay pipeline (research state, population, smoke, command-center labels). `status: partial (2026-02-24, texture-backed building/defense sprites plus population/research/smoke overlays wired; command-center label parity pending)`
6. `RENDER-04` Port item/hazard sprite-frame rendering rules (mine visibility, bomb armed state, orb animation). `status: partial (2026-02-24, texture-backed hazard sprites wired; orb/item frame parity expansion pending)`
7. `FX-01` Port sprite effects (muzzle flash/explosions/smoke/floating points) with texture assets. `status: partial (2026-02-24, texture-backed muzzle flash + explosion frames + floating points event queue wired; sprite-text and remaining variants pending)`
8. `UI-01` Rebuild textured side panel + radar + interactive panel buttons. `status: partial (2026-02-24, in-canvas textured side panel + radar + clickable staff/city/points/map/help/options/build/exit hotspots + subview state panels + texture-backed glyphs/radar palette background added; full legacy visual fidelity pending)`
9. `UI-02` Port full lobby overlay UX (tabs/filter/high scores/identity workflows).
10. `UI-03` Port options modal city-import/advanced controls.
11. `UI-04` Port notifications/orb hint/menu affordance system.
12. `AUDIO-01` Restore legacy audio packs and map event triggers to concrete sound IDs.
13. `INPUT-01` Port interaction-layer cursor/build/demolish fidelity.
14. `QA-01` Add screenshot-based visual regression tests for parity checkpoints.

## Implementation Log
- 2026-02-24:
  - Imported legacy `master:client/data` corpus into `apps/client-ts/public/assets`.
  - Added client texture registry/loader: `apps/client-ts/src/render/LegacyTextureRegistry.ts`.
  - Wired scene startup to load legacy textures.
  - Switched tank rendering to atlas-frame textures with role/city rows (fallback to procedural if texture unavailable).
  - Switched building/defense/bullet entities to texture-first rendering where legacy atlas frames are available.
  - Added texture-backed terrain layers (ground/rocks/lava) with fallback colors.
  - Added texture-backed hazard sprites and muzzle-flash effects with fallback drawing paths.
  - Added in-canvas side panel + radar renderer with texture-backed panel background fallback.
  - Added panel click hotspots via mouse input for staff/city/points/map/help/options/build/exit actions.
  - Added texture-backed changing-layer overlays for population, research state, and factory smoke cues.
  - Added texture-backed orb explosion frame effect.
  - Added network-driven client visual effect queue (`player.dead`/`bullet.resolved`/`city.orbed`) for explosions and floating points.
  - Added side-panel subview rendering branches (`status`/`staff`/`city`/`points`) and active-button affordance states.
  - Added texture-backed panel glyph rendering (health/cash/research) and radar palette texture background integration.
  - Reduced default left HUD diagnostics (debug/hostile/control-hint lines now gated behind bot-debug toggle) to better match player-facing legacy presentation.

---

## Closure Criteria for This Audit
Treat this list as complete when all `ASSET-*`, `RENDER-*`, `FX-*`, `UI-*`, `AUDIO-*`, and `INPUT-*` items above are moved to implemented and verified by side-by-side visual parity captures versus legacy flows.

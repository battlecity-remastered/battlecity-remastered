"use strict";

const { loadMapData } = require("../server/src/utils/mapLoader");
const citySpawns = require("../shared/citySpawns.json");
const {
  isHouse,
  isResearch,
  isHospital,
  isCommandCenter,
  isFactory
} = require("../server/src/constants");

const {
  TILE_SIZE,
  COMMAND_CENTER_WIDTH_TILES,
  COMMAND_CENTER_HEIGHT_TILES,
  MAP_SIZE_TILES,
  MAP_PIXEL_SIZE,
  OB_PAD_PX,
  LOS_STEP_PX,
  BLOCKING_TILE_VALUES,
  DEFAULT_BUILDING_TILES,
  PLAYER_RECT_SIZE
} = require("./config");
const {
  clamp,
  playerRectFromCenter,
  rectsTouchOrOverlap
} = require("./helpers");

const fallbackWidthTiles = Number(COMMAND_CENTER_WIDTH_TILES) || DEFAULT_BUILDING_TILES;
const fallbackHeightTiles = Number(COMMAND_CENTER_HEIGHT_TILES) || DEFAULT_BUILDING_TILES;

const resolveBuildingFootprint = (building) => {
  const fallback = {
    width: fallbackWidthTiles,
    height: fallbackHeightTiles
  };
  if (!building) {
    return fallback;
  }

  const explicitWidth = Number(building.width);
  const explicitHeight = Number(building.height);
  if (Number.isFinite(explicitWidth) && Number.isFinite(explicitHeight)) {
    return {
      width: explicitWidth,
      height: explicitHeight
    };
  }

  const type = Number(building.type);
  if (!Number.isFinite(type)) {
    return fallback;
  }

  if (isHouse(type) || isResearch(type)) {
    return { width: 3, height: 3 };
  }

  if (isCommandCenter(type) || isHospital(type) || isFactory(type)) {
    return fallback;
  }

  return fallback;
};

class WorldState {
  constructor({ log = () => {}, warn = () => {} } = {}) {
    this.log = log;
    this.warn = warn;
    this.tileSize = TILE_SIZE;
    this.mapSizeTiles = MAP_SIZE_TILES;
    this.mapPixelSize = MAP_PIXEL_SIZE;
    this.obstacles = [];
    this.mapData = this._loadMap();
    this._mapIsXY = undefined;
  }

  _loadMap() {
    try {
      const data = loadMapData();
      if (data && Array.isArray(data.map)) {
        this.log(`Loaded map.dat (${data.map.length} columns)`);
        return data.map;
      }
    } catch (e) {
      this.warn(`Unable to load map data: ${e.message}`);
    }
    return [];
  }

  tileKey(tx, ty) {
    return `${tx},${ty}`;
  }

  getMapValue(tx, ty) {
    if (!Array.isArray(this.mapData) || !this.mapData.length) return 0;
    if (this._mapIsXY === undefined) {
      const xs = this.mapData.length;
      const ys = Array.isArray(this.mapData[0]) ? this.mapData[0].length : 0;
      if (xs === this.mapSizeTiles) this._mapIsXY = true;
      else if (ys === this.mapSizeTiles) this._mapIsXY = false;
      else this._mapIsXY = true;
      this.log(`Map orientation detected: ${this._mapIsXY ? "[x][y]" : "[y][x]"}`);
    }
    if (this._mapIsXY) {
      const col = this.mapData[tx];
      return Array.isArray(col) ? col[ty] || 0 : 0;
    }
    const row = this.mapData[ty];
    return Array.isArray(row) ? row[tx] || 0 : 0;
  }

  isTileBlocked(tx, ty) {
    return BLOCKING_TILE_VALUES.has(this.getMapValue(tx, ty));
  }

  isRectBlocked(rect) {
    const sx = clamp(Math.floor(rect.x / this.tileSize), 0, this.mapSizeTiles - 1);
    const ex = clamp(Math.floor((rect.x + rect.w - 1) / this.tileSize), 0, this.mapSizeTiles - 1);
    const sy = clamp(Math.floor(rect.y / this.tileSize), 0, this.mapSizeTiles - 1);
    const ey = clamp(Math.floor((rect.y + rect.h - 1) / this.tileSize), 0, this.mapSizeTiles - 1);

    for (let tx = sx; tx <= ex; tx++) {
      for (let ty = sy; ty <= ey; ty++) {
        if (this.isTileBlocked(tx, ty)) return true;
      }
    }

    for (const o of this.obstacles) {
      if (rectsTouchOrOverlap(rect, o)) return true;
    }
    return false;
  }

  isBlocked(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    if (x < 0 || y < 0) return true;
    if (x > this.mapPixelSize - this.tileSize || y > this.mapPixelSize - this.tileSize) return true;
    return this.isRectBlocked(playerRectFromCenter(x, y, PLAYER_RECT_SIZE));
  }

  lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 1) return true;
    const steps = Math.max(1, Math.ceil(dist / LOS_STEP_PX));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const y = ay + dy * t;
      if (this.isBlocked(x, y)) return false;
    }
    return true;
  }

  snapTargetToNearestFree(x, y, opts = {}) {
    const { avoid = null, avoidRadiusTiles = 1, maxRing = 6 } = opts;
    let tx0 = clamp(Math.floor(x / this.tileSize), 0, this.mapSizeTiles - 1);
    let ty0 = clamp(Math.floor(y / this.tileSize), 0, this.mapSizeTiles - 1);

    const aTx = avoid ? avoid.tx : -9999;
    const aTy = avoid ? avoid.ty : -9999;
    const isAvoided = (tx, ty) =>
      Math.abs(tx - aTx) <= avoidRadiusTiles && Math.abs(ty - aTy) <= avoidRadiusTiles;

    for (let r = 0; r <= maxRing; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = tx0 + dx;
          const ty = ty0 + dy;
          if (tx < 0 || ty < 0 || tx >= this.mapSizeTiles || ty >= this.mapSizeTiles) continue;
          if (avoid && isAvoided(tx, ty)) continue;
          const px = (tx + 0.5) * this.tileSize;
          const py = (ty + 0.5) * this.tileSize;
          if (!this.isBlocked(px, py)) return { x: px, y: py };
        }
      }
    }

    return {
      x: clamp((tx0 + 0.5) * this.tileSize, 0, this.mapPixelSize - this.tileSize),
      y: clamp((ty0 + 0.5) * this.tileSize, 0, this.mapPixelSize - this.tileSize)
    };
  }

  ensureNotInside(offset) {
    const rect = playerRectFromCenter(offset.x, offset.y, PLAYER_RECT_SIZE);
    if (!this.isRectBlocked(rect)) return null;

    const tx0 = Math.floor(offset.x / this.tileSize);
    const ty0 = Math.floor(offset.y / this.tileSize);
    for (let r = 1; r <= 6; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = tx0 + dx;
          const ty = ty0 + dy;
          if (tx < 0 || ty < 0 || tx >= this.mapSizeTiles || ty >= this.mapSizeTiles) continue;
          const px = (tx + 0.5) * this.tileSize;
          const py = (ty + 0.5) * this.tileSize;
          if (!this.isBlocked(px, py)) return { x: px, y: py };
        }
      }
    }
    return null;
  }

  addBuilding({ id, x, y, type, width, height }) {
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const footprint = resolveBuildingFootprint({ type, width, height });
    const tilesW = Math.max(
      1,
      Math.floor(Number.isFinite(footprint.width) ? footprint.width : fallbackWidthTiles)
    );
    const tilesH = Math.max(
      1,
      Math.floor(Number.isFinite(footprint.height) ? footprint.height : fallbackHeightTiles)
    );

    const worldX = x * this.tileSize;
    const worldY = y * this.tileSize;

    this.removeBuilding(id);
    this.obstacles.push({
      id,
      x: worldX - OB_PAD_PX,
      y: worldY - OB_PAD_PX,
      w: tilesW * this.tileSize + OB_PAD_PX * 2,
      h: tilesH * this.tileSize + OB_PAD_PX * 2
    });
  }

  removeBuilding(id) {
    this.obstacles = this.obstacles.filter(o => o.id !== id);
  }

  resolveCitySpawn(cityId) {
    if (!Number.isFinite(cityId)) return null;
    const entry = citySpawns && citySpawns[String(cityId)];
    if (!entry) return null;
    const tx = Number(entry.tileX);
    const ty = Number(entry.tileY);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { x: (tx + 0.5) * this.tileSize, y: (ty + 0.5) * this.tileSize };
  }
}

module.exports = { WorldState };

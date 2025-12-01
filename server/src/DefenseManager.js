"use strict";

const { TILE_SIZE } = require("./gameplay/constants");
const { isFactory, isCommandCenter, isHospital } = require("./constants");
const { normalizeItemType } = require("./items");
const { getPlayerRect } = require("./gameplay/geometry");

const ALLOWED_DEFENSE_TYPES = new Set([8, 9, 10, 11]);
const DEFENSE_LIFE = Object.freeze({
    8: 40,  // wall
    9: 32,  // turret
    10: 16, // sleeper
    11: 40, // plasma
});

const toFiniteNumber = (value, fallback = null) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (value, fallback = null) => {
    const numeric = toFiniteNumber(value, fallback);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
};

const clampAngle = (angle) => {
    if (!Number.isFinite(angle)) {
        return null;
    }
    const normalised = angle % 360;
    return normalised < 0 ? normalised + 360 : normalised;
};

class DefenseManager {

    constructor({ game, playerFactory, hazardManager = null }) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.hazardManager = hazardManager || null;
        this.io = null;
        this.defensesByCity = new Map();
        this.defensesById = new Map();
        this.sequence = 0;
    }

    setIo(io) {
        this.io = io;
    }

    ensureCity(cityId) {
        if (!this.defensesByCity.has(cityId)) {
            this.defensesByCity.set(cityId, new Map());
        }
        return this.defensesByCity.get(cityId);
    }

    getPlayerDominantTile(player) {
        if (!player || !player.offset) {
            return null;
        }
        const rect = getPlayerRect(player);
        const startX = Math.floor(rect.x / TILE_SIZE);
        const endX = Math.floor((rect.x + rect.w - 1) / TILE_SIZE);
        const startY = Math.floor(rect.y / TILE_SIZE);
        const endY = Math.floor((rect.y + rect.h - 1) / TILE_SIZE);

        let best = null;
        const playerCenterTileX = Math.floor((player.offset.x + TILE_SIZE / 2) / TILE_SIZE);
        const playerCenterTileY = Math.floor((player.offset.y + TILE_SIZE / 2) / TILE_SIZE);

        for (let tx = startX; tx <= endX; tx += 1) {
            for (let ty = startY; ty <= endY; ty += 1) {
                const tileRect = {
                    x: tx * TILE_SIZE,
                    y: ty * TILE_SIZE,
                    w: TILE_SIZE,
                    h: TILE_SIZE
                };
                const overlapW = Math.max(0, Math.min(rect.x + rect.w, tileRect.x + tileRect.w) - Math.max(rect.x, tileRect.x));
                const overlapH = Math.max(0, Math.min(rect.y + rect.h, tileRect.y + tileRect.h) - Math.max(rect.y, tileRect.y));
                const area = overlapW * overlapH;
                if (area <= 0) {
                    continue;
                }
                if (!best || area > best.area ||
                    (area === best.area && tx === playerCenterTileX && ty === playerCenterTileY)) {
                    best = { x: tx, y: ty, area };
                }
            }
        }

        if (best) {
            return { x: best.x, y: best.y };
        }
        return {
            x: playerCenterTileX,
            y: playerCenterTileY
        };
    }

    isFactoryPickupTile(tileX, tileY) {
        const factory = this.game?.buildingFactory;
        if (!factory || !factory.buildings || typeof factory.buildings.values !== "function") {
            return false;
        }
        for (const building of factory.buildings.values()) {
            if (!building || !isFactory(building.type)) {
                continue;
            }
            // Pickup zone is the entire bottom row of the 3x3 footprint
            const pickupY = building.y + 2;
            const pickupXMin = building.x;
            const pickupXMax = building.x + 2;
            if (tileY === pickupY && tileX >= pickupXMin && tileX <= pickupXMax) {
                return true;
            }
        }
        return false;
    }

    isPlacementAllowedOnBuilding(tileX, tileY) {
        const factory = this.game?.buildingFactory;
        if (!factory || !factory.buildings || typeof factory.buildings.values !== "function") {
            return false;
        }
        for (const building of factory.buildings.values()) {
            if (!building) {
                continue;
            }
            const inFootprint = tileX >= building.x && tileX < building.x + 3
                && tileY >= building.y && tileY < building.y + 3;
            if (!inFootprint) {
                continue;
            }
            if (isFactory(building.type)) {
                if (this.isFactoryPickupTile(tileX, tileY)) {
                    return true;
                }
                continue;
            }
            if (isCommandCenter(building.type) || isHospital(building.type)) {
                const bottomRow = building.y + 2;
                if (tileY === bottomRow) {
                    return true;
                }
            }
        }
        return false;
    }

    isTileBlocked(tileX, tileY) {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            return true;
        }
        if (tileX < 0 || tileY < 0 || tileX > 512 || tileY > 512) {
            return true;
        }

        // Buildings occupy a 3x3 footprint starting at (x, y)
        if (this.game?.buildingFactory?.buildings) {
            for (const building of this.game.buildingFactory.buildings.values()) {
                if (!building) {
                    continue;
                }
                const footprintX = building.x;
                const footprintY = building.y;
                if (tileX >= footprintX && tileX < footprintX + 3 &&
                    tileY >= footprintY && tileY < footprintY + 3) {
                    // Allow placement on factory pickup tiles and select building footprints (CC/Hospital)
                    if (this.isFactoryPickupTile(tileX, tileY) || this.isPlacementAllowedOnBuilding(tileX, tileY)) {
                        return false;
                    }
                    return true;
                }
            }
        }

        // Existing defenses
        for (const defense of this.defensesById.values()) {
            if (!defense) {
                continue;
            }
            const defenseTileX = Math.floor(defense.x / TILE_SIZE);
            const defenseTileY = Math.floor(defense.y / TILE_SIZE);
            if (defenseTileX === tileX && defenseTileY === tileY) {
                return true;
            }
        }

        // Hazards (mines/bombs/dfg) occupy a single tile
        if (this.hazardManager && this.hazardManager.hazards) {
            for (const hazard of this.hazardManager.hazards.values()) {
                if (!hazard) {
                    continue;
                }
                const hazardTileX = Math.floor(hazard.x / TILE_SIZE);
                const hazardTileY = Math.floor(hazard.y / TILE_SIZE);
                if (hazardTileX === tileX && hazardTileY === tileY) {
                    return true;
                }
            }
        }

        return false;
    }

    findNearestFreeTile(preferredTile, searchRadius = 2) {
        if (!preferredTile) {
            return null;
        }
        const visited = new Set();
        const queue = [{ x: preferredTile.x, y: preferredTile.y, dist: 0 }];

        while (queue.length) {
            const current = queue.shift();
            const key = `${current.x},${current.y}`;
            if (visited.has(key)) {
                continue;
            }
            visited.add(key);

            if (!this.isTileBlocked(current.x, current.y)) {
                return { x: current.x, y: current.y, adjusted: current.dist > 0 };
            }

            if (current.dist >= searchRadius) {
                continue;
            }

            const nextDist = current.dist + 1;
            const offsets = [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: 0, dy: -1 },
            ];
            for (const offset of offsets) {
                queue.push({ x: current.x + offset.dx, y: current.y + offset.dy, dist: nextDist });
            }
        }

        return null;
    }

    resolvePlacementForPlayer(player) {
        const preferred = this.getPlayerDominantTile(player);
        if (!preferred) {
            return null;
        }
        const free = this.findNearestFreeTile(preferred);
        if (!free) {
            return null;
        }
        return {
            tileX: free.x,
            tileY: free.y,
            adjusted: !!free.adjusted,
            preferred
        };
    }

    parsePayload(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload === "string") {
            try {
                return JSON.parse(payload);
            } catch (_error) {
                return null;
            }
        }
        if (typeof payload === "object") {
            return payload;
        }
        return null;
    }

    sanitiseDefenseRecord(input, defaults = {}) {
        if (!input) {
            return null;
        }
        const type = toFiniteNumber(input.type, null);
        if (!Number.isFinite(type) || !ALLOWED_DEFENSE_TYPES.has(type)) {
            return null;
        }
        const rawX = toFiniteNumber(input.x, null);
        const rawY = toFiniteNumber(input.y, null);
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
            return null;
        }
        const x = Math.floor(rawX / TILE_SIZE) * TILE_SIZE;
        const y = Math.floor(rawY / TILE_SIZE) * TILE_SIZE;
        if (x < 0 || y < 0 || x > (512 * TILE_SIZE) || y > (512 * TILE_SIZE)) {
            return null;
        }
        const cityId = normaliseCityId(
            input.cityId !== undefined ? input.cityId : defaults.cityId,
            null
        );
        if (cityId === null || cityId === undefined) {
            return null;
        }
        const teamId = normaliseCityId(
            input.teamId !== undefined ? input.teamId : defaults.teamId,
            cityId
        );

        let identifier = input.id;
        if (typeof identifier !== "string" || !identifier.trim()) {
            identifier = `defense_${cityId}_${Date.now()}_${++this.sequence}`;
        }

        const ownerIdRaw = input.ownerId ?? defaults.ownerId ?? null;
        const ownerId = ownerIdRaw ? String(ownerIdRaw) : null;
        const angle = clampAngle(
            toFiniteNumber(input.angle, defaults.angle ?? null)
        );

        const maxLife = Number.isFinite(input.maxLife)
            ? input.maxLife
            : DEFENSE_LIFE[Math.floor(type)] ?? null;
        const life = Number.isFinite(input.life)
            ? input.life
            : maxLife;

        return {
            id: identifier,
            type: Math.floor(type),
            x,
            y,
            teamId,
            cityId,
            ownerId,
            angle,
            source: input.source || defaults.source || "player",
            createdAt: Date.now(),
            createdBy: defaults.createdBy ?? null,
            maxLife: maxLife ?? null,
            life: life ?? null,
        };
    }

    addDefense(record, options = {}) {
        if (!record) {
            return null;
        }
        const cityId = normaliseCityId(record.cityId, null);
        if (cityId === null || cityId === undefined) {
            return null;
        }
        const cityDefenses = this.ensureCity(cityId);
        cityDefenses.set(record.id, record);
        this.defensesById.set(record.id, record);
        if (options.broadcast !== false) {
            this.broadcastCity(cityId);
        }
        return record;
    }

    removeDefense(cityId, id, options = {}) {
        if (cityId === null || cityId === undefined || !id) {
            return false;
        }
        const numericCityId = normaliseCityId(cityId, null);
        const record = this.defensesById.get(id);
        if (!record || normaliseCityId(record.cityId, null) !== numericCityId) {
            return false;
        }
        return this.removeDefenseRecord(record, options);
    }

    removeDefenseById(id, options = {}) {
        if (!id) {
            return false;
        }
        const record = this.defensesById.get(id);
        if (!record) {
            return false;
        }
        return this.removeDefenseRecord(record, options);
    }

    removeDefenseRecord(record, options = {}) {
        if (!record) {
            return false;
        }
        const cityId = normaliseCityId(record.cityId ?? record.teamId, null);
        if (cityId === null || cityId === undefined) {
            return false;
        }
        const cityDefenses = this.defensesByCity.get(cityId);
        if (cityDefenses) {
            cityDefenses.delete(record.id);
            if (cityDefenses.size === 0) {
                this.defensesByCity.delete(cityId);
            }
        }
        this.defensesById.delete(record.id);

        if (options.broadcast !== false) {
            this.broadcastCity(cityId);
        }
        return true;
    }

    removeDefensesByType(cityId, type, options = {}) {
        const numericCityId = normaliseCityId(cityId, null);
        const numericType = toFiniteNumber(type, null);
        if (numericCityId === null || numericType === null) {
            return 0;
        }
        const cityDefenses = this.defensesByCity.get(numericCityId);
        if (!cityDefenses || cityDefenses.size === 0) {
            return 0;
        }
        let removed = 0;
        for (const [id, record] of Array.from(cityDefenses.entries())) {
            if (record.type === numericType) {
                const record = this.defensesById.get(id) || record;
                this.removeDefenseRecord(record, { broadcast: false });
                removed += 1;
            }
        }
        if (removed && options.broadcast !== false) {
            this.broadcastCity(numericCityId);
        }
        return removed;
    }

    getOutstandingCount(cityId, itemType) {
        const numericCity = normaliseCityId(cityId, null);
        const normalizedType = normalizeItemType(itemType, null);
        if (numericCity === null || normalizedType === null) {
            return 0;
        }
        if (!ALLOWED_DEFENSE_TYPES.has(normalizedType)) {
            return 0;
        }
        const cityDefenses = this.defensesByCity.get(numericCity);
        if (!cityDefenses || cityDefenses.size === 0) {
            return 0;
        }
        let total = 0;
        for (const defense of cityDefenses.values()) {
            if (defense.type === normalizedType) {
                total += 1;
            }
        }
        return total;
    }

    applyDefenseDamage(id, amount = 1, options = {}) {
        if (!id) {
            return false;
        }
        const record = this.defensesById.get(id);
        if (!record) {
            return false;
        }
        const damage = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
        if (damage <= 0) {
            return false;
        }
        const baseLife = DEFENSE_LIFE[record.type] ?? null;
        if (!Number.isFinite(record.maxLife) && baseLife !== null) {
            record.maxLife = baseLife;
        }
        if (!Number.isFinite(record.life)) {
            record.life = record.maxLife ?? baseLife ?? damage;
        }
        record.life -= damage;
        if (record.life <= 0) {
            this.removeDefenseRecord(record, {
                broadcast: options.broadcast !== false
            });
            return true;
        }
        return false;
    }

    removeDefensesBySource(cityId, source, options = {}) {
        const cityDefenses = this.defensesByCity.get(cityId);
        if (!cityDefenses || !source) {
            return;
        }
        let removed = false;
        for (const [id, record] of Array.from(cityDefenses.entries())) {
            if ((record.source || "player") === source) {
                cityDefenses.delete(id);
                this.defensesById.delete(id);
                removed = true;
            }
        }
        if (cityDefenses.size === 0) {
            this.defensesByCity.delete(cityId);
        }
        if (removed && options.broadcast !== false) {
            this.broadcastCity(cityId);
        }
    }

    replaceSystemDefenses(cityId, items, options = {}) {
        const ownerId = options.ownerId ?? null;
        this.removeDefensesBySource(cityId, "system", { broadcast: false });
        const sanitised = [];
        if (Array.isArray(items) && items.length) {
            items.forEach((item) => {
                const record = this.sanitiseDefenseRecord(
                    Object.assign({}, item, { source: "system", ownerId }),
                    { cityId, teamId: cityId, ownerId, source: "system" }
                );
                if (record) {
                    this.addDefense(record, { broadcast: false });
                    sanitised.push({
                        id: record.id,
                        type: record.type,
                        x: record.x,
                        y: record.y,
                        teamId: record.teamId,
                        ownerId: record.ownerId,
                        angle: record.angle ?? null,
                    });
                }
            });
        }
        this.broadcastCity(cityId);
        return sanitised;
    }

    clearCity(cityId, options = {}) {
        const cityDefenses = this.defensesByCity.get(cityId);
        if (!cityDefenses) {
            return;
        }
        for (const id of cityDefenses.keys()) {
            this.defensesById.delete(id);
        }
        this.defensesByCity.delete(cityId);
        if (options.broadcast !== false) {
            this.broadcastCity(cityId);
        }
    }

    getCityDefenses(cityId) {
        const cityDefenses = this.defensesByCity.get(cityId);
        if (!cityDefenses) {
            return [];
        }
        return Array.from(cityDefenses.values()).map((record) => ({
            id: record.id,
            type: record.type,
            x: record.x,
            y: record.y,
            teamId: record.teamId,
            cityId: record.cityId,
            ownerId: record.ownerId ?? null,
            angle: record.angle ?? null,
            source: record.source || "player",
        }));
    }

    broadcastCity(cityId, target = null) {
        const emitter = target ?? this.io;
        if (!emitter) {
            return;
        }
        const payload = {
            cityId,
            items: this.getCityDefenses(cityId)
        };
        emitter.emit("city:defenses", payload);
    }

    sendSnapshot(target) {
        if (!target) {
            return;
        }
        for (const cityId of this.defensesByCity.keys()) {
            this.broadcastCity(cityId, target);
        }
    }

    handleSpawn(socket, payload) {
        const parsed = this.parsePayload(payload);
        if (!parsed) {
            return;
        }
        const player = this.playerFactory.getPlayer(socket.id);
        if (!player) {
            return;
        }
        const playerCity = normaliseCityId(player.city, null);
        const requestedCity = normaliseCityId(parsed.cityId, playerCity);
        if (playerCity !== null && requestedCity !== playerCity) {
            return;
        }
        const placement = this.resolvePlacementForPlayer(player);
        if (!placement) {
            return;
        }

        const snappedInput = Object.assign({}, parsed, {
            x: placement.tileX * TILE_SIZE,
            y: placement.tileY * TILE_SIZE
        });

        const record = this.sanitiseDefenseRecord(snappedInput, {
            cityId: playerCity,
            teamId: playerCity,
            ownerId: player.id || socket.id,
            createdBy: socket.id,
            source: "player"
        });
        if (!record) {
            return;
        }

        // [SECURITY] Deduct inventory first
        const consumed = this.recordInventoryConsumption(socket.id, record);
        if (consumed <= 0) {
            return;
        }

        this.addDefense(record);
    }

    handleRemove(socket, payload) {
        const parsed = this.parsePayload(payload);
        if (!parsed) {
            return;
        }
        const id = typeof parsed === "string" ? parsed : parsed.id;
        if (!id) {
            return;
        }
        const reason = typeof parsed === "object" && typeof parsed.reason === "string"
            ? parsed.reason.trim().toLowerCase()
            : null;
        const destroyedRemoval = reason === "destroyed" || reason === "killed";

        const record = this.defensesById.get(id);
        if (!record) {
            return;
        }

        const player = socket ? this.playerFactory.getPlayer(socket.id) : null;
        const playerCity = player ? normaliseCityId(player.city, null) : null;
        const recordCity = normaliseCityId(record.cityId ?? record.teamId, null);
        const isFriendlyRemoval = recordCity !== null && playerCity !== null && recordCity === playerCity;

        if (!isFriendlyRemoval) {
            // Allow hostile removals only for destroyed/killed reasons so defenders
            // can be cleared when shot by enemies.
            if (!destroyedRemoval) {
                return;
            }
        }

        const shouldRefund = !destroyedRemoval && isFriendlyRemoval;
        const refundOwner = shouldRefund ? (socket?.id || record.ownerId || null) : null;
        this.removeDefenseRecord(record, {
            broadcast: true,
            refund: shouldRefund,
            refundOwnerId: refundOwner
        });
    }

    recordInventoryConsumption(socketId, record) {
        if (!record || !this.game || !this.game.buildingFactory || !this.game.buildingFactory.cityManager) {
            return 0;
        }
        const cityId = normaliseCityId(record.cityId, null);
        const type = toFiniteNumber(record.type, null);
        if (cityId === null || type === null) {
            return 0;
        }
        const ownerId = socketId || record.ownerId || null;
        return this.game.buildingFactory.cityManager.recordInventoryConsumption(ownerId, cityId, type, 1);
    }
}

module.exports = DefenseManager;

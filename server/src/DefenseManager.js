"use strict";

const { TILE_SIZE } = require("./gameplay/constants");
const { normalizeItemType } = require("./items");

const ALLOWED_DEFENSE_TYPES = new Set([8, 9, 10, 11]);

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

    constructor({ game, playerFactory }) {
        this.game = game;
        this.playerFactory = playerFactory;
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
        const cityDefenses = this.defensesByCity.get(cityId);
        if (!cityDefenses || !cityDefenses.has(id)) {
            return false;
        }
        cityDefenses.delete(id);
        this.defensesById.delete(id);
        if (cityDefenses.size === 0) {
            this.defensesByCity.delete(cityId);
        }
        if (options.broadcast !== false) {
            this.broadcastCity(cityId);
        }
        return true;
    }

    removeDefenseById(id, options = {}) {
        if (!id) {
            return false;
        }
        const record = this.defensesById.get(id);
        if (!record) {
            return false;
        }
        return this.removeDefense(record.cityId, id, options);
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
                cityDefenses.delete(id);
                this.defensesById.delete(id);
                removed += 1;
            }
        }
        if (cityDefenses.size === 0) {
            this.defensesByCity.delete(numericCityId);
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
        const record = this.sanitiseDefenseRecord(parsed, {
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

    handleRemove(_socket, payload) {
        const parsed = this.parsePayload(payload);
        if (!parsed) {
            return;
        }
        const id = typeof parsed === "string" ? parsed : parsed.id;
        if (!id) {
            return;
        }
        this.removeDefenseById(id);
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

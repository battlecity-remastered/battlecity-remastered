"use strict";

const { ITEM_TYPES, normalizeItemType } = require("./items");

const DEFAULT_DROP_TYPES = new Set([
    ITEM_TYPES.CLOAK,
    ITEM_TYPES.ROCKET,
    ITEM_TYPES.MEDKIT,
    ITEM_TYPES.FLARE,
    ITEM_TYPES.LASER,
    ITEM_TYPES.ORB
]);

const toNumber = (value, fallback = null) => {
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

class IconDropManager {
    constructor({ cityManager = null, playerFactory = null, buildingFactory = null, allowedTypes = null } = {}) {
        this.cityManager = cityManager;
        this.playerFactory = playerFactory;
        this.buildingFactory = buildingFactory;
        this.allowedTypes = allowedTypes instanceof Set && allowedTypes.size
            ? allowedTypes
            : DEFAULT_DROP_TYPES;
        this.io = null;
        this.droppedIcons = new Map();
    }

    setIo(io) {
        this.io = io;
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

    handleDrop(socket, payload) {
        if (!socket) {
            return;
        }
        const data = this.parsePayload(payload);
        if (!data) {
            this.emitDropResult(socket, { status: "rejected", reason: "invalid_payload" });
            return;
        }

        const player = this.getPlayer(socket.id);
        if (!player) {
            this.emitDropResult(socket, { status: "rejected", reason: "unknown_player" });
            return;
        }

        const cityId = this.toCityId(player.city);
        if (!Number.isFinite(cityId)) {
            this.emitDropResult(socket, { status: "rejected", reason: "no_city" });
            return;
        }

        const type = normalizeItemType(data.type, null);
        if (!Number.isFinite(type) || !this.allowedTypes.has(type)) {
            this.emitDropResult(socket, { status: "rejected", reason: "unsupported_item" });
            return;
        }

        const dropX = toNumber(data.x, null);
        const dropY = toNumber(data.y, null);
        if (!Number.isFinite(dropX) || !Number.isFinite(dropY)) {
            this.emitDropResult(socket, { status: "rejected", reason: "bad_coordinates" });
            return;
        }

        const quantity = this.toQuantity(data.quantity);
        if (quantity <= 0) {
            this.emitDropResult(socket, { status: "rejected", reason: "invalid_quantity" });
            return;
        }

        const consumed = this.consumeFromPlayer(socket.id, cityId, type, quantity);
        if (consumed < quantity) {
            if (consumed > 0) {
                this.restoreCityInventory(socket.id, cityId, type, consumed);
            }
            this.emitDropResult(socket, { status: "rejected", reason: "insufficient_inventory" });
            return;
        }

        this.restoreCityInventory(null, cityId, type, quantity);

        const id = this.resolveIconId(data.id, socket.id);
        const record = {
            id,
            type,
            x: dropX,
            y: dropY,
            cityId,
            teamId: this.toCityId(data.teamId, cityId),
            quantity,
            droppedBy: socket.id,
        };

        this.droppedIcons.set(id, record);
        this.broadcastIconSpawn(record);
        this.emitDropResult(socket, { status: "ok", id });
    }

    handlePickup(socket, payload) {
        if (!socket) {
            return;
        }
        const data = this.parsePayload(payload);
        if (!data || !data.id) {
            this.emitPickupResult(socket, { status: "rejected", reason: "invalid_payload" });
            return;
        }
        const record = this.droppedIcons.get(data.id);
        if (!record) {
            this.emitPickupResult(socket, { status: "missing", id: data.id });
            return;
        }
        const player = this.getPlayer(socket.id);
        if (!player) {
            this.emitPickupResult(socket, { status: "rejected", reason: "unknown_player", id: record.id });
            return;
        }
        const cityId = this.toCityId(player.city);
        if (!Number.isFinite(cityId) || cityId !== record.cityId) {
            this.emitPickupResult(socket, { status: "rejected", reason: "wrong_team", id: record.id });
            return;
        }

        // Prevent duplicates when multiple players race for the same drop.
        this.droppedIcons.delete(record.id);

        this.removeFromCityInventory(cityId, record.type, record.quantity);
        this.restoreCityInventory(socket.id, cityId, record.type, record.quantity);

        this.decrementFactoryStock(record);
        this.broadcastIconRemoval(record, { reason: "collected", collector: socket.id });
        this.emitPickupResult(socket, { status: "ok", id: record.id });
    }

    consumeFromPlayer(socketId, cityId, itemType, quantity) {
        if (!this.cityManager || typeof this.cityManager.recordInventoryConsumption !== "function") {
            return 0;
        }
        return this.cityManager.recordInventoryConsumption(socketId, cityId, itemType, quantity);
    }

    restoreCityInventory(socketId, cityId, itemType, quantity) {
        if (!this.cityManager || typeof this.cityManager.recordInventoryPickup !== "function") {
            return 0;
        }
        return this.cityManager.recordInventoryPickup(socketId, cityId, itemType, quantity);
    }

    removeFromCityInventory(cityId, itemType, quantity) {
        if (!this.cityManager || typeof this.cityManager.recordInventoryConsumption !== "function") {
            return 0;
        }
        return this.cityManager.recordInventoryConsumption(null, cityId, itemType, quantity);
    }

    broadcastIconSpawn(record) {
        if (!this.io || !record) {
            return;
        }
        const payload = {
            id: record.id,
            x: record.x,
            y: record.y,
            type: record.type,
            quantity: record.quantity,
            cityId: record.cityId,
            teamId: record.teamId,
            sharedDrop: true,
            skipProductionUpdate: true,
        };
        this.io.emit("new_icon", JSON.stringify(payload));
    }

    broadcastIconRemoval(record, meta = {}) {
        if (!this.io || !record) {
            return;
        }
        const payload = {
            id: record.id,
            type: record.type,
            x: record.x,
            y: record.y,
            cityId: record.cityId,
            teamId: record.teamId,
            reason: meta.reason || "removed",
            sharedDrop: true,
        };
        this.io.emit("icon:remove", JSON.stringify(payload));
    }

    emitDropResult(socket, payload) {
        if (!socket) {
            return;
        }
        socket.emit("icon:drop:result", payload);
    }

    emitPickupResult(socket, payload) {
        if (!socket) {
            return;
        }
        socket.emit("icon:pickup:result", payload);
    }

    resolveIconId(requestedId, socketId) {
        if (typeof requestedId === "string" && requestedId.trim().length) {
            return requestedId.trim();
        }
        const suffix = Math.random().toString(16).slice(2, 8);
        return `icon_${socketId || "server"}_${Date.now()}_${suffix}`;
    }

    toQuantity(value) {
        const numeric = toNumber(value, 1);
        if (!Number.isFinite(numeric)) {
            return 1;
        }
        return Math.max(1, Math.floor(numeric));
    }

    getPlayer(socketId) {
        if (!this.playerFactory || typeof this.playerFactory.getPlayer !== "function") {
            return null;
        }
        return this.playerFactory.getPlayer(socketId);
    }

    decrementFactoryStock(record) {
        if (!record || !record.buildingId || !this.buildingFactory || !this.buildingFactory.buildings) {
            return;
        }
        const building = this.buildingFactory.buildings.get(record.buildingId);
        if (!building) {
            return;
        }
        const previous = Number.isFinite(building.itemsLeft) ? building.itemsLeft : 0;
        const quantity = Number.isFinite(record.quantity) ? Math.max(1, Math.floor(record.quantity)) : 1;
        const next = Math.max(0, previous - quantity);
        if (next === previous) {
            return;
        }
        building.itemsLeft = next;
        if (typeof this.buildingFactory.emitPopulationUpdate === "function") {
            this.buildingFactory.emitPopulationUpdate(building);
        }
        if (this.buildingFactory.io) {
            const snapshot = this.buildingFactory.serializeBuilding(building);
            this.buildingFactory.io.emit("new_building", JSON.stringify(snapshot));
        }
    }

    toCityId(value, fallback = null) {
        const numeric = toNumber(value, null);
        if (Number.isFinite(numeric)) {
            return Math.max(0, Math.floor(numeric));
        }
        return fallback;
    }

    clearCity(cityId) {
        const numeric = this.toCityId(cityId, null);
        if (!Number.isFinite(numeric)) {
            return 0;
        }
        let removed = 0;
        for (const [id, record] of Array.from(this.droppedIcons.entries())) {
            if (record.cityId !== numeric) {
                continue;
            }
            this.droppedIcons.delete(id);
            this.broadcastIconRemoval(record, { reason: "city_cleared" });
            removed += 1;
        }
        return removed;
    }
}

module.exports = IconDropManager;

"use strict";

const {
    TILE_SIZE,
    DAMAGE_MINE,
    DAMAGE_BOMB,
    BOMB_TIMER_MS,
    BOMB_EXPLOSION_TILE_RADIUS,
    TIMER_DFG,
} = require("../gameplay/constants");
const { ITEM_TYPES, normalizeItemType } = require("../items");
const { rectangleCollision } = require("../gameplay/geometry");

const HAZARD_TYPES = {
    MINE: "mine",
    BOMB: "bomb",
    DFG: "dfg"
};

const HAZARD_REVEAL_DURATION_MS = 750;

const ITEM_TYPE_MAP = {
    3: HAZARD_TYPES.BOMB,
    4: HAZARD_TYPES.MINE,
    7: HAZARD_TYPES.DFG
};

const HAZARD_TYPE_TO_ITEM = new Map([
    [HAZARD_TYPES.BOMB, ITEM_TYPES.BOMB],
    [HAZARD_TYPES.MINE, ITEM_TYPES.MINE],
    [HAZARD_TYPES.DFG, ITEM_TYPES.DFG],
]);

const toCityId = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.floor(parsed));
        }
    }
    return null;
};

class HazardManager {

    constructor(game, playerFactory) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.io = null;
        this.hazards = new Map();
        this.pendingIdsBySocket = new Map();
    }

    setIo(io) {
        this.io = io;
    }

    sendSnapshot(socket) {
        if (!socket) {
            return;
        }
        for (const hazard of this.hazards.values()) {
            socket.emit('hazard:spawn', JSON.stringify({
                id: hazard.id,
                type: hazard.type,
                x: hazard.x,
                y: hazard.y,
                ownerId: hazard.ownerId,
                teamId: hazard.teamId,
                active: !!hazard.active,
                armed: !!hazard.armed,
                detonateAt: hazard.detonateAt || null,
                revealedAt: hazard.revealedAt || null,
                triggeredBy: hazard.triggeredBy || null,
                triggeredTeam: hazard.triggeredTeam ?? null
            }));
        }
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

    getHazardTypeFromItem(type) {
        return ITEM_TYPE_MAP[type] || null;
    }

    sanitizeSpawn(socket, payload) {
        if (!payload) {
            return null;
        }
        const type = this.getHazardTypeFromItem(payload.type ?? payload.itemType);
        if (!type) {
            return null;
        }
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        const hazard = {
            id: (typeof payload.id === "string" && payload.id.length > 0) ? payload.id : `${socket.id}_${Date.now()}`,
            ownerId: socket.id,
            teamId: this.playerFactory?.getPlayerTeam(socket.id) ?? null,
            type,
            x,
            y,
            createdAt: Date.now(),
            active: type === HAZARD_TYPES.MINE,
            armed: type === HAZARD_TYPES.MINE,
            detonateAt: null,
            revealedAt: null,
            cleanupAt: null,
            pendingRemovalReason: null,
            triggeredBy: null,
            triggeredTeam: null
        };

        if (type === HAZARD_TYPES.BOMB) {
            const armed = payload.armed === true;
            hazard.armed = armed;
            hazard.active = armed;
            hazard.detonateAt = armed ? hazard.createdAt + BOMB_TIMER_MS : null;
        } else if (type === HAZARD_TYPES.DFG) {
            hazard.active = true;
            hazard.armed = true;
        }
        return hazard;
    }

    spawnHazard(socket, payload) {
        const parsed = this.parsePayload(payload);
        if (!parsed) {
            return null;
        }
        const hazard = this.sanitizeSpawn(socket, parsed);
        if (!hazard) {
            return null;
        }

        if (this.hazards.has(hazard.id)) {
            return this.hazards.get(hazard.id);
        }

        // [SECURITY] Deduct inventory first
        const consumed = this.recordInventoryConsumption(socket.id, hazard);
        if (consumed <= 0) {
            return null;
        }

        this.hazards.set(hazard.id, hazard);

        if (!this.pendingIdsBySocket.has(socket.id)) {
            this.pendingIdsBySocket.set(socket.id, new Set());
        }
        this.pendingIdsBySocket.get(socket.id).add(hazard.id);

        this.broadcastHazard("hazard:spawn", hazard);
        return hazard;
    }

    spawnSystemHazard(payload) {
        if (!payload) {
            return null;
        }
        const typeInput = payload.type ?? payload.hazardType ?? payload.itemType;
        let type = null;
        if (typeof typeInput === "string") {
            const normalised = typeInput.toLowerCase();
            if (normalised === HAZARD_TYPES.MINE) {
                type = HAZARD_TYPES.MINE;
            } else if (normalised === HAZARD_TYPES.BOMB) {
                type = HAZARD_TYPES.BOMB;
            } else if (normalised === HAZARD_TYPES.DFG) {
                type = HAZARD_TYPES.DFG;
            }
        } else {
            type = this.getHazardTypeFromItem(typeInput);
        }
        if (!type) {
            return null;
        }
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        const hazard = {
            id: (typeof payload.id === "string" && payload.id.length > 0)
                ? payload.id
                : `system_${type}_${Date.now()}_${Math.random().toString(16).slice(-6)}`,
            ownerId: payload.ownerId || 'system',
            teamId: payload.teamId ?? null,
            type,
            x,
            y,
            createdAt: Date.now(),
            active: type === HAZARD_TYPES.MINE ? true : !!payload.active,
            armed: type === HAZARD_TYPES.MINE ? true : !!payload.armed,
            detonateAt: null,
            revealedAt: null,
            cleanupAt: null,
            pendingRemovalReason: null,
            triggeredBy: null,
            triggeredTeam: null
        };

        if (type === HAZARD_TYPES.BOMB) {
            const armed = hazard.armed;
            hazard.active = armed;
            hazard.detonateAt = armed ? hazard.createdAt + BOMB_TIMER_MS : null;
        } else if (type === HAZARD_TYPES.DFG) {
            hazard.active = true;
            hazard.armed = true;
        }

        if (this.hazards.has(hazard.id)) {
            return this.hazards.get(hazard.id);
        }

        this.hazards.set(hazard.id, hazard);
        this.broadcastHazard("hazard:spawn", hazard);
        return hazard;
    }

    handleArm(socket, payload) {
        if (!payload || !payload.id) {
            return;
        }
        const hazard = this.hazards.get(payload.id);
        if (!hazard || hazard.ownerId !== socket.id) {
            return;
        }

        if (hazard.type !== HAZARD_TYPES.BOMB) {
            return;
        }

        const armed = !!payload.armed;
        hazard.armed = armed;
        hazard.active = armed;
        hazard.detonateAt = armed ? Date.now() + BOMB_TIMER_MS : null;
        this.broadcastHazard("hazard:update", hazard);
    }

    handleRemove(socket, payload) {
        if (!payload || !payload.id) {
            return;
        }
        const hazard = this.hazards.get(payload.id);
        if (!hazard) {
            return;
        }

        const hazardTeam = toCityId(hazard.teamId);
        const playerTeam = this.playerFactory?.getPlayerTeam(socket.id) ?? null;
        const isOwner = hazard.ownerId === socket.id;
        const isFriendlyMine = hazard.type === HAZARD_TYPES.MINE && hazardTeam !== null && hazardTeam === playerTeam;
        const isFriendlyBomb = hazard.type === HAZARD_TYPES.BOMB && hazardTeam !== null && hazardTeam === playerTeam;

        if (!isOwner && !isFriendlyMine && !isFriendlyBomb) {
            return;
        }

        if (isFriendlyMine || isFriendlyBomb) {
            this.recordInventoryPickup(socket.id, hazard);
        }

        const reason = (typeof payload.reason === "string" && payload.reason.trim().length > 0)
            ? payload.reason.trim()
            : ((isFriendlyMine || isFriendlyBomb) ? "picked_up" : "owner_removed");

        this.removeHazard(payload.id, reason);
    }

    onDisconnect(socketId) {
        const owned = Array.from(this.hazards.values()).filter((hazard) => hazard.ownerId === socketId);
        owned.forEach((hazard) => {
            this.removeHazard(hazard.id, "owner_disconnected");
        });
        this.pendingIdsBySocket.delete(socketId);
    }

    removeHazard(id, reason) {
        const hazard = this.hazards.get(id);
        if (!hazard) {
            return;
        }
        this.hazards.delete(id);
        const payload = Object.assign({ reason }, hazard);
        this.broadcastHazard("hazard:remove", payload);
    }

    recordInventoryConsumption(socketId, hazard) {
        if (!hazard || !this.game || !this.game.buildingFactory || !this.game.buildingFactory.cityManager) {
            return 0;
        }
        const itemType = HAZARD_TYPE_TO_ITEM.get(hazard.type);
        if (itemType === undefined) {
            return 0;
        }
        const cityId = Number.isFinite(hazard.teamId) ? Math.floor(hazard.teamId) : null;
        if (cityId === null) {
            return 0;
        }
        const ownerId = socketId || (typeof hazard.ownerId === "string" ? hazard.ownerId : null);
        return this.game.buildingFactory.cityManager.recordInventoryConsumption(ownerId, cityId, itemType, 1);
    }

    recordInventoryPickup(socketId, hazard) {
        if (!hazard || !this.game || !this.game.buildingFactory || !this.game.buildingFactory.cityManager) {
            return;
        }
        const itemType = HAZARD_TYPE_TO_ITEM.get(hazard.type);
        if (itemType === undefined) {
            return;
        }
        const cityId = toCityId(hazard.teamId);
        if (cityId === null) {
            return;
        }
        const ownerId = socketId || (typeof hazard.ownerId === "string" ? hazard.ownerId : null);
        this.game.buildingFactory.cityManager.recordInventoryPickup(ownerId, cityId, itemType, 1);
    }

    removeHazardsByCityAndItem(cityId, itemType, reason = "factory_destroyed") {
        const hazardType = this.getHazardTypeFromItem(itemType);
        if (!hazardType) {
            return 0;
        }
        const numericCityId = Number.isFinite(cityId) ? Math.floor(cityId) : null;
        let removed = 0;
        for (const hazard of Array.from(this.hazards.values())) {
            if (hazard.type !== hazardType) {
                continue;
            }
            const hazardCity = Number.isFinite(hazard.teamId) ? Math.floor(hazard.teamId) : null;
            if (numericCityId !== null && hazardCity !== numericCityId) {
                continue;
            }
            this.removeHazard(hazard.id, reason);
            removed += 1;
        }
        return removed;
    }

    broadcastHazard(event, hazard) {
        if (!this.io) {
            return;
        }
        const payload = {
            id: hazard.id,
            type: hazard.type,
            x: hazard.x,
            y: hazard.y,
            ownerId: hazard.ownerId,
            teamId: hazard.teamId,
            active: !!hazard.active,
            armed: !!hazard.armed,
            detonateAt: hazard.detonateAt || null,
            reason: hazard.reason || undefined,
            revealedAt: hazard.revealedAt || null,
            triggeredBy: hazard.triggeredBy || null,
            triggeredTeam: hazard.triggeredTeam ?? null
        };
        this.io.emit(event, JSON.stringify(payload));
    }

    update(_deltaMs) {
        if (this.hazards.size === 0) {
            return;
        }

        const now = Date.now();

        for (const hazard of Array.from(this.hazards.values())) {
            if (!hazard.active && hazard.cleanupAt && now >= hazard.cleanupAt) {
                const reason = hazard.pendingRemovalReason || hazard.reason || "expired";
                this.removeHazard(hazard.id, reason);
                continue;
            }

            if (!hazard.active) {
                continue;
            }

            if (hazard.type === HAZARD_TYPES.BOMB) {
                this.updateBomb(hazard, now);
            } else if (hazard.type === HAZARD_TYPES.MINE) {
                this.updateMine(hazard, now);
            } else if (hazard.type === HAZARD_TYPES.DFG) {
                this.updateDFG(hazard, now);
            }
        }
    }

    updateMine(hazard, now) {
        const players = this.game.players;
        const bulletRect = {
            x: hazard.x,
            y: hazard.y,
            w: TILE_SIZE,
            h: TILE_SIZE
        };

        for (const [socketId, player] of Object.entries(players)) {
            if (!this.shouldDamagePlayer(hazard, socketId, player)) {
                continue;
            }
            if (this.playerIntersectsRect(player, bulletRect)) {
                this.applyDamage(socketId, DAMAGE_MINE, {
                    type: hazard.type,
                    hazardId: hazard.id,
                    ownerId: hazard.ownerId,
                    teamId: hazard.teamId ?? null
                });
                this.onHazardTriggered(hazard, {
                    now,
                    reason: "mine_triggered",
                    socketId,
                    player
                });
                break;
            }
        }
    }

    updateBomb(hazard, now) {
        if (!hazard.armed || !hazard.active) {
            return;
        }

        if (hazard.detonateAt && now >= hazard.detonateAt) {
            this.detonateBomb(hazard);
        }
    }

    detonateBomb(hazard) {
        const centerTileX = Math.floor((hazard.x + TILE_SIZE / 2) / TILE_SIZE);
        const centerTileY = Math.floor((hazard.y + TILE_SIZE / 2) / TILE_SIZE);

        this.damagePlayersInRadius(hazard, centerTileX, centerTileY);
        this.destroyBuildingsInRadius(hazard, centerTileX, centerTileY);
        this.removeHazard(hazard.id, "bomb_detonated");
    }

    damagePlayersInRadius(hazard, centerTileX, centerTileY) {
        for (const [socketId, player] of Object.entries(this.game.players)) {
            if (!this.shouldDamagePlayer(hazard, socketId, player)) {
                continue;
            }
            const playerTileX = Math.floor((player.offset?.x ?? 0 + TILE_SIZE / 2) / TILE_SIZE);
            const playerTileY = Math.floor((player.offset?.y ?? 0 + TILE_SIZE / 2) / TILE_SIZE);
            if (Math.abs(playerTileX - centerTileX) <= BOMB_EXPLOSION_TILE_RADIUS &&
                Math.abs(playerTileY - centerTileY) <= BOMB_EXPLOSION_TILE_RADIUS) {
                this.applyDamage(socketId, DAMAGE_BOMB, {
                    type: hazard.type,
                    hazardId: hazard.id,
                    ownerId: hazard.ownerId
                });
            }
        }
    }

    destroyBuildingsInRadius(hazard, centerTileX, centerTileY) {
        if (!this.game || !this.game.buildingFactory || typeof this.game.buildingFactory.destroyBuildingsInRadius !== 'function') {
            return;
        }
        this.game.buildingFactory.destroyBuildingsInRadius(centerTileX, centerTileY, BOMB_EXPLOSION_TILE_RADIUS, {
            excludeCommandCenters: true,
            reason: 'bomb_detonated',
            hazard,
        });
    }

    shouldDamagePlayer(hazard, socketId, player) {
        if (!player || !player.offset) {
            return false;
        }
        if (socketId === hazard.ownerId) {
            return false;
        }
        const hazardTeam = hazard.teamId ?? null;
        const playerTeam = this.playerFactory?.getPlayerTeam(socketId) ?? null;
        if (hazardTeam !== null && hazardTeam === playerTeam) {
            return false;
        }
        return true;
    }

    updateDFG(hazard, now) {
        const players = this.game.players;
        const hazardRect = {
            x: hazard.x,
            y: hazard.y,
            w: TILE_SIZE,
            h: TILE_SIZE
        };

        for (const [socketId, player] of Object.entries(players)) {
            if (!this.shouldDamagePlayer(hazard, socketId, player)) {
                continue;
            }
            if (this.playerIntersectsRect(player, hazardRect)) {
                if (this.playerFactory && typeof this.playerFactory.applyFreeze === 'function') {
                    this.playerFactory.applyFreeze(socketId, TIMER_DFG, {
                        source: 'dfg',
                        hazardId: hazard.id,
                        ownerId: hazard.ownerId
                    });
                }
                this.onHazardTriggered(hazard, {
                    now,
                    reason: "dfg_triggered",
                    socketId,
                    player
                });
                break;
            }
        }
    }

    onHazardTriggered(hazard, { now, reason, socketId, player }) {
        hazard.active = false;
        hazard.armed = false;
        hazard.revealedAt = now;
        hazard.cleanupAt = now + HAZARD_REVEAL_DURATION_MS;
        hazard.pendingRemovalReason = reason;
        hazard.triggeredBy = player?.id || socketId;
        hazard.triggeredTeam = this.playerFactory?.getPlayerTeam(socketId) ?? null;
        this.broadcastHazard("hazard:update", hazard);
    }

    playerIntersectsRect(player, rect) {
        const px = player.offset?.x ?? 0;
        const py = player.offset?.y ?? 0;
        const playerRect = {
            x: px + 8,
            y: py + 8,
            w: TILE_SIZE - 16,
            h: TILE_SIZE - 16
        };
        return rectangleCollision(playerRect, rect);
    }

    applyDamage(socketId, amount, meta) {
        if (!this.playerFactory) {
            return;
        }
        this.playerFactory.applyDamage(socketId, amount, meta);
    }

    removeHazardsForTeam(teamId, reason = "city_destroyed") {
        if (teamId === null || teamId === undefined) {
            return 0;
        }
        let removed = 0;
        for (const hazard of Array.from(this.hazards.values())) {
            if ((hazard.teamId ?? null) !== teamId) {
                continue;
            }
            this.removeHazard(hazard.id, reason);
            removed += 1;
        }
        return removed;
    }

    getOutstandingCount(cityId, itemType) {
        const numericCity = toCityId(cityId);
        const normalizedType = normalizeItemType(itemType, null);
        if (numericCity === null || normalizedType === null) {
            return 0;
        }
        const hazardType = this.getHazardTypeFromItem(normalizedType);
        if (!hazardType) {
            return 0;
        }
        let total = 0;
        for (const hazard of this.hazards.values()) {
            if (hazard.type !== hazardType) {
                continue;
            }
            const hazardCity = toCityId(hazard.teamId);
            if (hazardCity === null || hazardCity !== numericCity) {
                continue;
            }
            total += 1;
        }
        return total;
    }
}

module.exports = HazardManager;

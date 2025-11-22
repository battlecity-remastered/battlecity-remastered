import { io } from 'socket.io-client';
import EventEmitter2 from 'eventemitter2';
import { getCitySpawn, getCityDisplayName } from './utils/citySpawns.js';
import { SOUND_IDS } from './audio/AudioManager.js';
import spawnMuzzleFlash from './effects/muzzleFlash.js';

const CHAT_MAX_LENGTH = 240;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;
const DEFAULT_CHAT_SCOPE = 'team';
const LOCAL_SHOT_CACHE_TTL_MS = 700;

import { updateBotWaypoints } from './draw/draw-bot-debug.js';

const LOCAL_SOCKET_PORT = 8021;

const resolveSocketUrl = () => {
    let explicitUrl = null;
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            const env = import.meta.env;
            explicitUrl = env.VITE_SOCKET_URL || env.VITE_SERVER_URL || null;
            if (explicitUrl) {
                explicitUrl = String(explicitUrl).trim();
            }
        }
    } catch (_error) {
        // ignore env access errors
    }

    if (explicitUrl) {
        return explicitUrl.replace(/\/$/, '');
    }

    if (typeof window !== 'undefined' && window.location) {
        const { protocol, hostname } = window.location;
        const isSecure = protocol === 'https:';
        const normalisedProtocol = isSecure ? 'https:' : 'http:';
        const lowerHost = (hostname || '').toLowerCase();
        const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(lowerHost);

        if (isLocalhost) {
            return `${normalisedProtocol}//${hostname}:${LOCAL_SOCKET_PORT}`;
        }

        if (window.location.origin) {
            return window.location.origin;
        }

        const portSegment = window.location.port ? `:${window.location.port}` : '';
        return `${normalisedProtocol}//${hostname}${portSegment}`;
    }

    return `http://localhost:${LOCAL_SOCKET_PORT}`;
};

class SocketListener extends EventEmitter2 {

    constructor(game) {
        super();
        this.game = game;
        this.sequenceCounter = 0;
        this.lastServerSequence = 0;
        this.localShotCache = new Map();

        this.on('bot:debug', (data) => {
            updateBotWaypoints(data);
        });
    }

    listen() {
        const socketUrl = resolveSocketUrl();
        this.io = io(socketUrl, {
            transports: ['websocket']
        });
        this.io.on("connect", () => {
            console.log("connected");
            this.sequenceCounter = 0;
            this.lastServerSequence = 0;
            this.emit("connected");
            this.requestLobbySnapshot();
            if (this.game && this.game.identityManager && typeof this.game.identityManager.handleSocketConnected === 'function') {
                this.game.identityManager.handleSocketConnected();
            }
        });
        this.io.on("connect_error", (err) => {
            console.error("socket connect_error", err?.message ?? err);
        });
        this.io.on("disconnect", (reason) => {
            console.warn("socket disconnected", reason);
            this.lastServerSequence = 0;
            this.emit('disconnected', reason);
        });

        this.io.on('chat:message', (payload) => {
            const data = this.safeParse(payload);
            this.emit('chat:message', data);
        });

        this.io.on('chat:history', (payload) => {
            const data = this.safeParse(payload);
            this.emit('chat:history', data);
        });

        this.io.on('chat:rate_limit', (payload) => {
            const data = this.safeParse(payload);
            this.emit('chat:rate_limit', data);
        });

        this.io.on('lobby:snapshot', (payload) => {
            const data = this.safeParse(payload);
            this.emit('lobby:snapshot', data);
        });

        this.io.on('lobby:update', (payload) => {
            const data = this.safeParse(payload);
            this.emit('lobby:update', data);
        });

        this.io.on('identity:ack', (payload) => {
            const data = this.safeParse(payload);
            this.emit('identity:ack', data);
        });

        this.io.on('lobby:assignment', (payload) => {
            const data = this.safeParse(payload);
            if (data && this.game && this.game.player) {
                if (data.city !== undefined && data.city !== null) {
                    this.game.player.city = this.toFiniteNumber(data.city, this.game.player.city ?? 0);
                }
                if (data.role) {
                    this.game.player.isMayor = (data.role === 'mayor');
                }
            }
            this.emit('lobby:assignment', data);
        });

        this.io.on('lobby:denied', (payload) => {
            const data = this.safeParse(payload);
            this.emit('lobby:denied', data);
        });

        this.io.on('lobby:released', (payload) => {
            const data = this.safeParse(payload);
            this.emit('lobby:released', data);
        });

        this.io.on("enter_game", (player) => {
            const normalised = this.normalisePlayerPayload(player);
            if (!normalised) {
                return;
            }
            this.applyPlayerUpdate(normalised, { source: 'enter_game' });
        });

        this.io.on("player", (player) => {
            const normalised = this.normalisePlayerPayload(player);
            if (!normalised) {
                return;
            }
            this.applyPlayerUpdate(normalised, { source: 'player' });
        });

        this.io.on("players:snapshot", (payload) => {
            const snapshot = this.safeParse(payload);
            if (!Array.isArray(snapshot)) {
                return;
            }
            snapshot.forEach((entry) => {
                const normalised = this.normalisePlayerPayload(entry);
                if (!normalised) {
                    return;
                }
                this.applyPlayerUpdate(normalised, { source: 'snapshot' });
            });
        });

        this.io.on("player:removed", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !data.id) {
                return;
            }
            if (this.io?.id && data.id === this.io.id) {
                return;
            }
            delete this.game.otherPlayers[data.id];
        });

        this.io.on("player:rejected", (payload) => {
            const rejection = this.safeParse(payload);
            if (!rejection) {
                return;
            }
            if (Array.isArray(rejection.reasons) && rejection.reasons.length) {
                console.warn("Authoritative server rejected player update", rejection.reasons);
            }
            if (rejection.player) {
                const normalised = this.normalisePlayerPayload(rejection.player);
                if (!normalised) {
                    return;
                }
                this.applyPlayerUpdate(normalised, { source: 'rejected' });
            }
        });

        this.io.on("bullet_shot", (payload) => {
            this.handleBulletShot(payload);
        });

        this.io.on("new_icon", (icon) => {
            const payload = typeof icon === 'string' ? JSON.parse(icon) : icon;
            if (!payload || !this.game || !this.game.iconFactory) {
                return;
            }
            const ownerId = payload.ownerId ?? payload.owner ?? null;
            if (payload.id && typeof this.game.iconFactory.getIconById === 'function') {
                const existing = this.game.iconFactory.getIconById(payload.id);
                if (existing) {
                    existing.x = payload.x;
                    existing.y = payload.y;
                    if (payload.quantity !== undefined) {
                        existing.quantity = Math.max(1, parseInt(payload.quantity, 10) || 1);
                    }
                    existing.city = payload.cityId ?? existing.city;
                    existing.teamId = payload.teamId ?? payload.cityId ?? existing.teamId;
                    existing.isSharedDrop = !!payload.sharedDrop;
                    existing.synced = true;
                    return;
                }
            }
            this.game.iconFactory.newIcon(ownerId, payload.x, payload.y, payload.type, {
                sourceBuildingId: payload.buildingId ?? payload.sourceBuildingId ?? null,
                city: payload.cityId ?? null,
                teamId: payload.teamId ?? payload.cityId ?? null,
                quantity: payload.quantity ?? 1,
                armed: !!payload.armed,
                id: payload.id ?? null,
                isSharedDrop: !!payload.sharedDrop,
                skipProductionUpdate: !!payload.skipProductionUpdate,
                synced: true,
            });
        });

        this.io.on("icon:remove", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !this.game || !this.game.iconFactory) {
                return;
            }
            if (data.id && typeof this.game.iconFactory.removeIconById === "function") {
                const removed = this.game.iconFactory.removeIconById(data.id, { onlyUnowned: true });
                if (removed) {
                    return;
                }
            }
            if (typeof data.x === "number" &&
                typeof data.y === "number" &&
                data.type !== undefined &&
                typeof this.game.iconFactory.removeUnownedIconsNear === "function") {
                this.game.iconFactory.removeUnownedIconsNear(
                    data.x,
                    data.y,
                    data.type,
                    1,
                    32,
                    data.teamId ?? data.cityId ?? null
                );
            }
        });

        this.io.on("factory:purge", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !this.game || !this.game.iconFactory) {
                return;
            }
            const itemType = this.toFiniteNumber(data.itemType, null);
            const cityId = this.toFiniteNumber(data.cityId, null);
            this.game.iconFactory.purgeCityItems(cityId, itemType);
        });

        this.io.on("new_building", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    data.type = Number(data.type);
                    data.population = data.population || 0;
                    data.ownerId = data.ownerId || data.owner || null;
                    data.attachedHouseId = data.attachedHouseId ?? null;
                    data.city = data.city ?? 0;
                    data.itemsLeft = data.itemsLeft || 0;
                    data.smokeActive = !!data.smokeActive;
                    data.smokeFrame = data.smokeFrame || 0;
                }
                this.emit('building:new', data);
            } catch (_error) {
                console.warn('Failed to parse new_building payload', _error);
            }
        });

        this.io.on("population:update", (update) => {
            try {
                const data = typeof update === 'string' ? JSON.parse(update) : update;
                if (data) {
                    data.type = Number(data.type);
                    data.population = data.population || 0;
                    data.attachedHouseId = data.attachedHouseId ?? null;
                    data.city = data.city ?? 0;
                    data.smokeActive = !!data.smokeActive;
                    data.smokeFrame = data.smokeFrame || 0;
                    data.itemsLeft = data.itemsLeft || 0;
                }
                this.emit('population:update', data);
            } catch (_error) {
                console.warn('Failed to parse population update', _error);
            }
        });

        this.io.on("research:update", (payload) => {
            const data = this.safeParse(payload);
            this.emit('research:update', data);
        });

        this.io.on("city:finance", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    this.emit('city:finance', data);
                }
            } catch (_error) {
                console.warn('Failed to parse finance update', _error);
            }
        });

        this.io.on("city:info", (payload) => {
            const data = this.safeParse(payload);
            if (!data || typeof data !== 'object') {
                return;
            }
            if (data.cityId === undefined && data.city !== undefined) {
                data.cityId = this.toFiniteNumber(data.city, data.city);
            } else if (data.cityId !== undefined) {
                data.cityId = this.toFiniteNumber(data.cityId, data.cityId);
            }
            this.emit('city:info', data);
        });

        this.io.on("city:defenses", (payload) => {
            const data = this.safeParse(payload);
            if (!data || data.cityId === undefined) {
                return;
            }
            const cityId = this.toFiniteNumber(data.cityId, data.cityId);
            if (cityId === null || cityId === undefined) {
                return;
            }
            const items = Array.isArray(data.items) ? data.items : [];
            if (this.game && typeof this.game.applyDefenseSnapshot === 'function') {
                this.game.applyDefenseSnapshot(cityId, items);
            }
        });

        this.io.on("city:defenses:clear", (payload) => {
            const data = this.safeParse(payload);
            if (!data || data.cityId === undefined) {
                return;
            }
            const cityId = this.toFiniteNumber(data.cityId, data.cityId);
            if (cityId === null || cityId === undefined) {
                return;
            }
            if (this.game && typeof this.game.clearDefenseItems === 'function') {
                this.game.clearDefenseItems(cityId);
            }
        });

        this.io.on("build:denied", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    this.emit('build:denied', data);
                }
            } catch (_error) {
                console.warn('Failed to parse build denied payload', _error);
            }
        });

        this.io.on("demolish_building", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data && data.id && this.game.buildingFactory?.removeBuildingById) {
                    this.game.buildingFactory.removeBuildingById(data.id);
                }
            } catch (_error) {
                console.warn('Failed to handle demolish payload', _error);
            }
        });

        this.io.on('demolish:denied', (payload) => {
            const data = this.safeParse(payload);
            if (this.game.buildingFactory?.handleDemolishDenied) {
                this.game.buildingFactory.handleDemolishDenied(data);
            }
        });

        this.io.on("player:health", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !data.id) {
                return;
            }
            this.applyHealthUpdate(data);
        });

        this.io.on("player:dead", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !data.id) {
                return;
            }
            this.emit('player:dead', data);
            this.applyHealthUpdate({ id: data.id, health: 0, source: data.reason });
        });

        this.io.on("player:status", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !data.id) {
                return;
            }
            this.applyStatusUpdate(data);
        });

        this.io.on("hazard:spawn", (payload) => {
            const hazard = this.normaliseHazardPayload(payload);
            if (!hazard) {
                return;
            }
            this.emit('hazard:spawn', hazard);
        });

        this.io.on("hazard:update", (payload) => {
            const hazard = this.normaliseHazardPayload(payload);
            if (!hazard) {
                return;
            }
            this.emit('hazard:update', hazard);
        });

        this.io.on("hazard:remove", (payload) => {
            const hazard = this.normaliseHazardPayload(payload);
            if (!hazard) {
                return;
            }
            this.emit('hazard:remove', hazard);
        });
        this.io.on("orb:result", (payload) => {
            const data = this.safeParse(payload);
            this.emit('orb:result', data);
        });
        this.io.on("city:orbed", (payload) => {
            const data = this.safeParse(payload);
            if (data) {
                this.handleCityOrbedAudio(data);
            }
            this.emit('city:orbed', data);
        });
        this.io.on("lobby:evicted", (payload) => {
            const data = this.safeParse(payload);
            this.emit('lobby:evicted', data);
        });
    }

    disconnectSocket() {
        if (!this.io) {
            return;
        }
        console.log('[socket] disconnecting existing socket');
        try {
            if (typeof this.io.removeAllListeners === 'function') {
                this.io.removeAllListeners();
            }
        } catch (error) {
            console.warn('Failed to clear socket listeners during disconnect', error);
        }
        if (typeof this.io.disconnect === 'function') {
            this.io.disconnect();
        }
        this.io = null;
    }

    reconnect() {
        console.log('[socket] reconnecting to server');
        this.disconnectSocket();
        this.listen();
    }

    sendNewBuilding(building) {
        if (this.io && !this.io.disconnected) {
            this.io.emit("new_building", JSON.stringify(building));
        }
    }

    sendDemolishBuilding(buildingId) {
        if (!this.io || this.io.disconnected || !buildingId) {
            return;
        }
        this.io.emit('demolish_building', JSON.stringify({ id: buildingId }));
    }

    requestCityInfo(cityId) {
        if (!this.io || this.io.disconnected) {
            return;
        }
        const numericId = this.toFiniteNumber(cityId, null);
        if (!Number.isFinite(numericId)) {
            return;
        }
        const normalised = Math.max(0, Math.floor(numericId));
        this.io.emit('city:inspect', JSON.stringify({ city: normalised }));
    }

    handleBulletShot(payload) {
        const data = this.safeParse(payload);
        if (!data || !this.game || !this.game.bulletFactory) {
            return;
        }
        const shooterId = (typeof data.shooter === 'string' && data.shooter.length)
            ? data.shooter
            : null;
        const localPlayerId = (typeof this.game?.player?.id === 'string' && this.game.player.id.length)
            ? this.game.player.id
            : null;
        const sourceType = (typeof data.sourceType === 'string' && data.sourceType.length > 0)
            ? data.sourceType.trim().toLowerCase()
            : null;
        const hasStructureSource = (sourceType && sourceType !== 'player')
            || (typeof data.sourceId === 'string' && data.sourceId.length > 0);
        if (localPlayerId && shooterId && shooterId === localPlayerId && !hasStructureSource) {
            return;
        }
        const options = {
            sourceId: data.sourceId ?? null,
            sourceType: sourceType ?? null,
            targetId: data.targetId ?? null,
        };
        if (data.damage !== undefined) {
            const numericDamage = Number(data.damage);
            if (Number.isFinite(numericDamage)) {
                options.damage = numericDamage;
            }
        }
        this.game.bulletFactory.newBullet(
            data.shooter,
            data.x,
            data.y,
            data.type,
            data.angle,
            data.team ?? null,
            options
        );
        const suppressSound = this.shouldSuppressShotSound(data);
        if (!suppressSound) {
            spawnMuzzleFlash(this.game, data.x, data.y);
        }
        if (!suppressSound) {
            this.playBulletShotSound(data);
        }
    }

    sendBulletShot(bullet) {
        if (bullet) {
            this.markLocalShot(bullet);
        }
        if (this.io && !this.io.disconnected) {
            this.io.emit("request_fire", JSON.stringify(bullet));
        }
    }

    enterGame(options = {}) {
        console.log("Telling server we've entered the game");
        if (this.io && !this.io.disconnected) {
            this.sequenceCounter = 0;
            this.game.player.sequence = 0;
            const payload = this.createPlayerPayload();
            const assignmentPayload = this.buildEntryAssignment(options);
            Object.assign(payload, assignmentPayload);
            this.io.emit("enter_game", JSON.stringify(payload));
            return this.io.id;
        }
        return null;
    }

    leaveGame(options = {}) {
        if (!this.io || this.io.disconnected) {
            console.warn('[socket] leaveGame aborted because socket is disconnected');
            return;
        }
        const payload = {};
        if (options && typeof options === 'object') {
            if (typeof options.reason === 'string' && options.reason.trim().length) {
                payload.reason = options.reason.trim();
            }
        }
        this.sequenceCounter = 0;
        this.lastServerSequence = 0;
        if (this.game && this.game.player) {
            this.game.player.sequence = 0;
        }
        if (this.localShotCache && typeof this.localShotCache.clear === 'function') {
            this.localShotCache.clear();
        }
        console.log('[socket] emitting lobby:leave', payload);
        this.io.emit('lobby:leave', JSON.stringify(payload));
    }

    requestLobbySnapshot() {
        if (this.io && !this.io.disconnected) {
            this.io.emit('lobby:refresh');
        }
    }

    buildEntryAssignment(options) {
        if (!options || typeof options !== 'object') {
            return {};
        }
        const payload = {};
        const assignment = {};
        let hasAssignment = false;

        if (options.city !== undefined && options.city !== null) {
            const numericCity = this.toFiniteNumber(options.city, null);
            if (Number.isFinite(numericCity)) {
                const cityId = Math.max(0, Math.floor(numericCity));
                payload.requestedCity = cityId;
                assignment.city = cityId;
                assignment.cityId = cityId;
                hasAssignment = true;
            }
        }

        if (options.role) {
            const role = `${options.role}`.trim().toLowerCase();
            if (role === 'mayor' || role === 'recruit' || role === 'auto') {
                payload.requestedRole = role;
                assignment.role = role;
                hasAssignment = true;
            }
        }

        if (options.auto === true) {
            payload.autoAssign = true;
        } else if (options.auto === false) {
            payload.autoAssign = false;
        }

        if (hasAssignment) {
            payload.assignment = assignment;
        }

        return payload;
    }

    cycle() {
        if (this.io && !this.io.disconnected) {
            this.sequenceCounter += 1;
            this.game.player.sequence = this.sequenceCounter;
            const payload = this.createPlayerPayload();
            this.io.emit("player", JSON.stringify(payload));
        }
    }

    spawnHazard(hazard) {
        if (!this.io || this.io.disconnected) {
            return;
        }
        this.io.emit('hazard:spawn', JSON.stringify(hazard));
    }

    useItem(type, data = {}) {
        if (!this.io || this.io.disconnected || !type) {
            return;
        }
        const payload = Object.assign({}, data, { type });
        this.io.emit('item:use', JSON.stringify(payload));
    }

    updateHazard(hazard) {
        if (!this.io || this.io.disconnected) {
            return;
        }
        this.io.emit('hazard:arm', JSON.stringify(hazard));
    }

    removeHazard(hazard) {
        if (!this.io || this.io.disconnected || !hazard) {
            return;
        }
        const payload = (typeof hazard === 'object') ? hazard : { id: hazard };
        if (!payload.id) {
            return;
        }
        this.io.emit('hazard:remove', JSON.stringify(payload));
    }

    spawnDefense(defense) {
        if (!this.io || this.io.disconnected || !defense) {
            return;
        }
        const payload = (typeof defense === 'string') ? defense : JSON.stringify(defense);
        this.io.emit('defense:spawn', payload);
    }

    removeDefense(id) {
        if (!this.io || this.io.disconnected || !id) {
            return;
        }
        const identifier = typeof id === 'object' ? (id.id ?? null) : id;
        if (!identifier) {
            return;
        }
        this.io.emit('defense:remove', JSON.stringify({ id: identifier }));
    }

    collectFactoryItem(data) {
        if (!this.io || this.io.disconnected || !data) {
            return;
        }
        const payload = (typeof data === 'string') ? data : JSON.stringify(data);
        this.io.emit('factory:collect', payload);
    }

    dropIcon(data) {
        if (!this.io || this.io.disconnected || !data) {
            return;
        }
        const payload = (typeof data === 'string') ? data : JSON.stringify(data);
        this.io.emit('icon:drop', payload);
    }

    collectDroppedIcon(data) {
        if (!this.io || this.io.disconnected || !data) {
            return;
        }
        const payload = (typeof data === 'string') ? data : JSON.stringify(data);
        this.io.emit('icon:pickup', payload);
    }

    reportOrbLoss(data) {
        if (!this.io || this.io.disconnected || !data) {
            return;
        }
        const payload = (typeof data === 'string') ? data : JSON.stringify(data);
        this.io.emit('orb:lost', payload);
    }

    sendOrbDrop(drop) {
        if (!this.io || this.io.disconnected || drop === null || drop === undefined) {
            return;
        }
        const payload = (typeof drop === 'string') ? drop : JSON.stringify(drop);
        this.io.emit('orb:drop', payload);
    }

    sendIdentityUpdate(identity) {
        if (!this.io || this.io.disconnected) {
            return;
        }
        const payload = {};
        if (identity && identity.id) {
            payload.identity = { id: identity.id };
            if (identity.name) {
                payload.identity.name = identity.name;
            }
        } else {
            payload.identity = null;
        }
        this.io.emit('identity:update', JSON.stringify(payload));
    }

    createPlayerPayload() {
        const player = this.game.player;
        const isMovingValue = Number.isFinite(player.isMoving) ? player.isMoving : Number(player.isMoving);
        const normalizedMoving = Number.isFinite(isMovingValue) ? Math.max(-1, Math.min(1, isMovingValue)) : 0;
        const isTurningValue = Number.isFinite(player.isTurning) ? player.isTurning : Number(player.isTurning);
        const normalizedTurning = Number.isFinite(isTurningValue) ? Math.max(-1, Math.min(1, Math.round(isTurningValue))) : 0;
        const payload = {
            id: player.id,
            city: player.city,
            isMayor: player.isMayor,
            health: player.health,
            direction: ((Math.round(player.direction) % 32) + 32) % 32,
            isTurning: normalizedTurning,
            isMoving: normalizedMoving,
            bombsArmed: !!player.bombsArmed,
            isCloaked: !!player.isCloaked,
            cloakExpiresAt: player.cloakExpiresAt ?? 0,
            isFrozen: !!player.isFrozen,
            frozenUntil: player.frozenUntil ?? 0,
            sequence: player.sequence,
            offset: {
                x: player.offset?.x ?? 0,
                y: player.offset?.y ?? 0
            }
        };
        if (this.game && this.game.identity && this.game.identity.id) {
            payload.identity = { id: this.game.identity.id };
        }
        if (this.game && this.game.identity && this.game.identity.name) {
            payload.callsign = this.game.identity.name;
        }
        return payload;
    }

    applyPlayerUpdate(player, context = {}) {
        if (!player || !player.id) {
            return;
        }
        const myId = this.io?.id;
        if (myId && player.id === myId) {
            this.syncLocalPlayer(player, context);
            return;
        }
        const existing = this.game.otherPlayers[player.id];
        if (existing && existing.sequence !== undefined && player.sequence !== undefined) {
            if (player.sequence <= existing.sequence) {
                return;
            }
        }
        const updated = existing ? Object.assign({}, existing, player) : Object.assign({}, player);
        if (!updated.callsign && existing && existing.callsign) {
            updated.callsign = existing.callsign;
        }
        if (!updated.userId && existing && existing.userId) {
            updated.userId = existing.userId;
        }
        this.game.otherPlayers[player.id] = updated;
        const isSnapshot = context && context.source === 'snapshot';
        const isEnterGame = context && context.source === 'enter_game';
        const isNewPlayer = !existing;
        if (isNewPlayer && !isSnapshot && isEnterGame) {
            this.notifyPlayerJoined(updated);
        }
    }

    syncLocalPlayer(player, context = {}) {
        if (!player || !this.game || !this.game.player) {
            return;
        }
        const me = this.game.player;
        if (player.sequence !== undefined && player.sequence < this.lastServerSequence && this.lastServerSequence !== 0) {
            const dxOutdated = Math.abs(player.offset.x - me.offset.x);
            const dyOutdated = Math.abs(player.offset.y - me.offset.y);
            const outdatedThreshold = 96;
            if (dxOutdated < outdatedThreshold && dyOutdated < outdatedThreshold) {
                return;
            }
        }

        if (player.sequence !== undefined) {
            this.lastServerSequence = Math.max(this.lastServerSequence, player.sequence);
        }

        me.id = player.id ?? me.id;
        if (typeof player.callsign === 'string' && player.callsign.trim().length) {
            me.callsign = player.callsign.trim();
        }
        if (typeof player.userId === 'string' && player.userId.trim().length) {
            me.userId = player.userId.trim();
        }
        const previousCity = Number.isFinite(me.city) ? me.city : null;
        const nextCity = this.toFiniteNumber(player.city, me.city);
        const cityChanged = previousCity !== nextCity;
        if (player.offset && typeof player.offset === 'object') {
            const serverX = this.toFiniteNumber(player.offset.x, me.offset.x);
            const serverY = this.toFiniteNumber(player.offset.y, me.offset.y);
            const diffX = serverX - me.offset.x;
            const diffY = serverY - me.offset.y;
            const diffDistanceSq = (diffX * diffX) + (diffY * diffY);
            const snapThresholdSq = 96 * 96;
            const lerpAlpha = 0.1;
            if (diffDistanceSq > snapThresholdSq) {
                me.offset.x = serverX;
                me.offset.y = serverY;
            } else {
                me.offset.x += diffX * lerpAlpha;
                me.offset.y += diffY * lerpAlpha;
            }
            if (me.lastSafeOffset) {
                me.lastSafeOffset.x = me.offset.x;
                me.lastSafeOffset.y = me.offset.y;
            }
        }
        me.city = nextCity;
        if (cityChanged) {
            const spawn = getCitySpawn(nextCity);
            if (spawn) {
                me.offset.x = spawn.x;
                me.offset.y = spawn.y;
            } else {
                const city = this.game.cities?.[nextCity];
                if (city) {
                    me.offset.x = city.x + 48;
                    me.offset.y = city.y + 100;
                }
            }
            if (me.lastSafeOffset) {
                me.lastSafeOffset.x = me.offset.x;
                me.lastSafeOffset.y = me.offset.y;
            }
        }
        me.isMayor = !!player.isMayor;
        me.health = this.toFiniteNumber(player.health, me.health);
        if (player.isCloaked !== undefined) {
            me.isCloaked = !!player.isCloaked;
        }
        if (player.cloakExpiresAt !== undefined) {
            const expires = this.toFiniteNumber(player.cloakExpiresAt, me.cloakExpiresAt ?? 0);
            me.cloakExpiresAt = Number.isFinite(expires) ? Math.max(0, expires) : 0;
        }
        if (player.isFrozen !== undefined) {
            me.isFrozen = !!player.isFrozen;
        }
        if (player.frozenUntil !== undefined) {
            const until = this.toFiniteNumber(player.frozenUntil, me.frozenUntil ?? 0);
            me.frozenUntil = Number.isFinite(until) ? Math.max(0, until) : 0;
            if (!me.isFrozen || me.frozenUntil === 0) {
                me.frozenBy = null;
            }
        }
        const serverDirection = Math.round(this.toFiniteNumber(player.direction, me.direction));
        if (Number.isFinite(serverDirection)) {
            const normalizedDirection = ((serverDirection % 32) + 32) % 32;
            const currentDirection = Number.isFinite(me.direction) ? ((Math.round(me.direction) % 32) + 32) % 32 : normalizedDirection;
            const directionDiff = Math.min(
                Math.abs(normalizedDirection - currentDirection),
                32 - Math.abs(normalizedDirection - currentDirection)
            );
            if (directionDiff > 4) {
                me.direction = normalizedDirection;
            }
        }
        if (player.sequence !== undefined) {
            me.sequence = player.sequence;
        }
        if (this.game && typeof this.game.updateOrbHint === 'function') {
            const shouldForce = context && context.source === 'enter_game';
            this.game.updateOrbHint({ force: shouldForce });
        }
    }

    notifyPlayerJoined(player) {
        if (!player || !this.game || typeof this.game.notify !== 'function') {
            return;
        }
        const label = this.buildPlayerLabel(player);
        if (!label) {
            return;
        }
        const cityName = this.buildPlayerCityLabel(player);
        const suffix = cityName ? ` in ${cityName}` : '';
        this.game.notify({
            title: 'Player joined',
            message: `${label} joined${suffix}.`,
            variant: 'info',
            timeout: 4200
        });
    }

    buildPlayerLabel(player) {
        if (!player) {
            return null;
        }
        if (typeof player.callsign === 'string' && player.callsign.trim().length) {
            return player.callsign.trim();
        }
        if (this.game && typeof this.game.resolveCallsign === 'function') {
            const resolved = this.game.resolveCallsign(player.id);
            if (resolved) {
                return resolved;
            }
        }
        if (player.id !== undefined && player.id !== null) {
            return `Player ${player.id}`;
        }
        return 'Player';
    }

    buildPlayerCityLabel(player) {
        if (!player) {
            return null;
        }
        const numericCity = Number(player.city);
        if (!Number.isFinite(numericCity)) {
            return null;
        }
        return getCityDisplayName(numericCity);
    }

    normalisePlayerPayload(payload) {
        const data = this.safeParse(payload);
        if (!data || typeof data !== 'object') {
            return null;
        }

        const player = Object.assign({}, data);
        if (!player.id) {
            if (payload && payload.id) {
                player.id = payload.id;
            } else {
                return null;
            }
        }

        const offset = (player.offset && typeof player.offset === 'object') ? player.offset : {};
        player.offset = {
            x: this.toFiniteNumber(offset.x, 0),
            y: this.toFiniteNumber(offset.y, 0)
        };
        player.city = this.toFiniteNumber(player.city, 0);
        player.isMayor = !!player.isMayor;
        const pointsValue = this.toFiniteNumber(player.points, null);
        if (Number.isFinite(pointsValue) && pointsValue >= 0) {
            player.points = Math.floor(pointsValue);
        } else {
            delete player.points;
        }
        if (typeof player.rankTitle === 'string') {
            const trimmedRank = player.rankTitle.trim();
            if (trimmedRank.length) {
                player.rankTitle = trimmedRank;
            } else {
                delete player.rankTitle;
            }
        }
        const healthValue = this.toFiniteNumber(player.health, this.game?.player?.health ?? 0);
        player.health = Number.isFinite(healthValue) ? Math.max(0, healthValue) : 0;
        const directionValue = this.toFiniteNumber(player.direction, 0);
        if (Number.isFinite(directionValue)) {
            player.direction = ((Math.round(directionValue) % 32) + 32) % 32;
        } else {
            player.direction = 0;
        }
        const turningValue = this.toFiniteNumber(player.isTurning, 0);
        player.isTurning = Math.max(-1, Math.min(1, Math.round(Number.isFinite(turningValue) ? turningValue : 0)));
        const movingValue = this.toFiniteNumber(player.isMoving, 0);
        if (!Number.isFinite(movingValue)) {
            player.isMoving = 0;
        } else if (movingValue > 1) {
            player.isMoving = 1;
        } else if (movingValue < -1) {
            player.isMoving = -1;
        } else {
            player.isMoving = movingValue;
        }
        player.sequence = Math.max(0, Math.round(this.toFiniteNumber(player.sequence, 0)));
        player.isCloaked = !!player.isCloaked;
        const cloakExpires = this.toFiniteNumber(player.cloakExpiresAt, player.isCloaked ? (player.cloakExpiresAt ?? 0) : 0);
        player.cloakExpiresAt = Number.isFinite(cloakExpires) ? Math.max(0, cloakExpires) : 0;
        player.isFrozen = !!player.isFrozen;
        const frozenUntil = this.toFiniteNumber(player.frozenUntil, player.isFrozen ? (player.frozenUntil ?? 0) : 0);
        player.frozenUntil = Number.isFinite(frozenUntil) ? Math.max(0, frozenUntil) : 0;
        if (player.isFrozen) {
            player.frozenBy = player.frozenBy ?? null;
        } else {
            player.frozenBy = null;
        }
        if (typeof player.callsign === 'string') {
            const trimmed = player.callsign.trim();
            if (trimmed.length) {
                player.callsign = trimmed;
            } else {
                delete player.callsign;
            }
        }

        if (player.userId !== undefined && player.userId !== null) {
            const idString = String(player.userId).trim();
            if (idString.length) {
                player.userId = idString;
            } else {
                delete player.userId;
            }
        }

        return player;
    }

    normaliseHazardPayload(payload) {
        const data = this.safeParse(payload);
        if (!data || typeof data !== 'object' || !data.id) {
            return null;
        }
        return {
            id: data.id,
            type: data.type,
            x: this.toFiniteNumber(data.x, 0),
            y: this.toFiniteNumber(data.y, 0),
            ownerId: data.ownerId ?? null,
            teamId: data.teamId ?? null,
            active: !!data.active,
            armed: !!data.armed,
            detonateAt: data.detonateAt ?? null,
            reason: data.reason ?? null,
            revealedAt: data.revealedAt ?? null,
            triggeredBy: data.triggeredBy ?? null,
            triggeredTeam: data.triggeredTeam ?? null
        };
    }

    applyHealthUpdate(update) {
        const healthValue = this.toFiniteNumber(update.health, null);
        if (!update.id || healthValue === null) {
            return;
        }
        const myId = this.io?.id;
        if (myId && update.id === myId) {
            const previous = Number.isFinite(this.game.player?.health) ? this.game.player.health : healthValue;
            const nextHealth = Math.max(0, healthValue);
            if (this.game.player) {
                this.game.player.health = nextHealth;
                if (nextHealth <= 0) {
                    this.game.player.engineLoopActive = false;
                }
            }
            if (this.game.audio) {
                if (nextHealth <= 0 && previous > 0) {
                    this.game.audio.playEffect(SOUND_IDS.DIE, { volume: 0.8 });
                    this.game.audio.setLoopState(SOUND_IDS.ENGINE, false);
                } else if (nextHealth < previous) {
                    this.game.audio.playEffect(SOUND_IDS.HIT, { volume: 0.7 });
                }
            }
            return;
        }
        if (!this.game.otherPlayers[update.id]) {
            this.game.otherPlayers[update.id] = { id: update.id };
        }
        this.game.otherPlayers[update.id].health = Math.max(0, healthValue);
    }

    applyStatusUpdate(update) {
        const myId = this.io?.id;
        const target = (myId && update.id === myId)
            ? this.game.player
            : (this.game.otherPlayers[update.id] ?? (this.game.otherPlayers[update.id] = { id: update.id }));
        if (!target) {
            return;
        }
        if (update.isCloaked !== undefined) {
            target.isCloaked = !!update.isCloaked;
        }
        if (update.cloakExpiresAt !== undefined) {
            const expires = this.toFiniteNumber(update.cloakExpiresAt, target.cloakExpiresAt ?? 0);
            target.cloakExpiresAt = Number.isFinite(expires) ? Math.max(0, expires) : 0;
        }
        if (update.isFrozen !== undefined) {
            target.isFrozen = !!update.isFrozen;
            if (!target.isFrozen) {
                target.frozenBy = null;
            }
        }
        if (update.frozenUntil !== undefined) {
            const until = this.toFiniteNumber(update.frozenUntil, target.frozenUntil ?? 0);
            target.frozenUntil = Number.isFinite(until) ? Math.max(0, until) : 0;
        }
        if (update.frozenBy !== undefined && update.frozenBy !== null) {
            target.frozenBy = update.frozenBy;
        }
        if (myId && update.id === myId) {
            this.game.forceDraw = true;
        }
    }

    playBulletShotSound(bullet) {
        if (!this.game || !this.game.audio) {
            return;
        }
        const soundId = this.resolveShotSoundId(bullet);
        if (!soundId) {
            return;
        }
        const x = this.toFiniteNumber(bullet?.x, null);
        const y = this.toFiniteNumber(bullet?.y, null);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            this.game.audio.playEffect(soundId, { position: { x, y } });
        } else {
            this.game.audio.playEffect(soundId);
        }
    }

    resolveShotSoundId(bullet) {
        const type = this.toFiniteNumber(bullet?.type, 0);
        if (type === 1) {
            return SOUND_IDS.ROCKET;
        }
        if (type === 3) {
            return SOUND_IDS.FLARE;
        }
        const sourceType = typeof bullet?.sourceType === 'string'
            ? bullet.sourceType.toLowerCase()
            : null;
        if (sourceType && (sourceType === 'turret' || sourceType === 'plasma' || sourceType === 'sleeper')) {
            return SOUND_IDS.TURRET;
        }
        return SOUND_IDS.LASER;
    }

    markLocalShot(bullet) {
        if (!bullet) {
            return;
        }
        if (!this.localShotCache) {
            this.localShotCache = new Map();
        }
        const now = Date.now();
        if (bullet.shooter) {
            this.localShotCache.set(`shooter:${bullet.shooter}`, now);
        }
        if (bullet.sourceId) {
            this.localShotCache.set(`source:${bullet.sourceId}`, now);
        }
        this.pruneLocalShots(now);
    }

    pruneLocalShots(now = Date.now()) {
        if (!this.localShotCache) {
            return;
        }
        const threshold = now - LOCAL_SHOT_CACHE_TTL_MS;
        this.localShotCache.forEach((timestamp, key) => {
            if (timestamp < threshold) {
                this.localShotCache.delete(key);
            }
        });
    }

    shouldSuppressShotSound(bullet) {
        if (!bullet || !this.localShotCache) {
            return false;
        }
        const now = Date.now();
        this.pruneLocalShots(now);
        if (bullet.shooter) {
            const key = `shooter:${bullet.shooter}`;
            const timestamp = this.localShotCache.get(key);
            if (timestamp && now - timestamp < LOCAL_SHOT_CACHE_TTL_MS) {
                return true;
            }
        }
        if (bullet.sourceId) {
            const key = `source:${bullet.sourceId}`;
            const timestamp = this.localShotCache.get(key);
            if (timestamp && now - timestamp < LOCAL_SHOT_CACHE_TTL_MS) {
                return true;
            }
        }
        return false;
    }

    handleCityOrbedAudio(event) {
        if (!event || !this.game || !this.game.audio) {
            return;
        }
        const myCity = this.toFiniteNumber(this.game.player?.city, null);
        if (myCity === null) {
            return;
        }
        const targetCity = this.toFiniteNumber(event.targetCity, null);
        const attackerCity = this.toFiniteNumber(event.attackerCity, null);
        if (Number.isFinite(targetCity) && myCity === targetCity) {
            this.game.audio.playEffect(SOUND_IDS.DIE);
            this.game.audio.setLoopState(SOUND_IDS.ENGINE, false);
            if (this.game.player) {
                this.game.player.engineLoopActive = false;
            }
            return;
        }
        if (Number.isFinite(attackerCity) && myCity === attackerCity) {
            this.game.audio.playEffect(SOUND_IDS.SCREECH);
        }
    }

    sendChatMessage(payload = {}) {
        if (!this.io || !this.io.connected) {
            return false;
        }
        const data = this.normaliseOutgoingChatPayload(payload);
        if (!data) {
            return false;
        }
        this.io.emit('chat:message', JSON.stringify(data));
        return true;
    }

    normaliseOutgoingChatPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }
        const scope = this.normaliseChatScope(payload.scope);
        const message = this.sanitiseChatText(payload.message ?? payload.text ?? '');
        if (!message) {
            return null;
        }
        return {
            scope,
            message
        };
    }

    normaliseChatScope(scope) {
        if (typeof scope === 'string') {
            const trimmed = scope.trim().toLowerCase();
            if (trimmed === 'global' || trimmed === 'all') {
                return 'global';
            }
            if (trimmed === 'team' || trimmed === 'city') {
                return 'team';
            }
        }
        return DEFAULT_CHAT_SCOPE;
    }

    sanitiseChatText(message) {
        if (message === null || message === undefined) {
            return '';
        }
        let text = String(message);
        text = text.replace(CONTROL_CHAR_PATTERN, '');
        text = text.replace(/\s+/g, ' ').trim();
        if (!text.length) {
            return '';
        }
        if (text.length > CHAT_MAX_LENGTH) {
            text = text.slice(0, CHAT_MAX_LENGTH);
        }
        return text;
    }

    safeParse(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload !== 'string') {
            return payload;
        }
        try {
            return JSON.parse(payload);
        } catch (_error) {
            console.warn("Failed to parse payload from server", _error);
            return null;
        }
    }

    toFiniteNumber(value, fallback) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        if (fallback !== undefined) {
            return fallback;
        }
        return 0;
    }


}


export default SocketListener;

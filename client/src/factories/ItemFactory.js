import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";
import {ITEM_TYPE_DFG} from "../constants";
import {ITEM_TYPE_MEDKIT} from "../constants";
import {ITEM_TYPE_CLOAK} from "../constants";
import {ITEM_TYPE_ROCKET} from "../constants";
import {BOMB_EXPLOSION_TILE_RADIUS} from "../constants";
import {BOMB_ITEM_TILE_RADIUS} from "../constants";
import {ITEM_TYPE_ORB} from "../constants";
import {ITEM_TYPE_FLARE} from "../constants";
import {BUILDING_COMMAND_CENTER} from "../constants";
import {MAX_HEALTH} from "../constants";
import {TIMER_DFG} from "../constants";
import {TIMER_CLOAK} from "../constants";
import {ITEM_INITIAL_LIFE} from "../constants";
import {ITEM_BURN_THRESHOLDS} from "../constants";
import { SOUND_IDS } from '../audio/AudioManager';
import spawnMuzzleFlash from "../effects/muzzleFlash";
import { applyHazardMetadata } from './hazardMetadata.js';

const STRUCTURE_ITEM_TYPES = new Set([
    ITEM_TYPE_WALL,
    ITEM_TYPE_TURRET,
    ITEM_TYPE_SLEEPER,
    ITEM_TYPE_PLASMA,
]);

const DEFENSE_ITEM_TYPES = new Set([
    ITEM_TYPE_TURRET,
    ITEM_TYPE_SLEEPER,
    ITEM_TYPE_PLASMA,
    ITEM_TYPE_WALL,
]);

const INSTANT_REMOVAL_ITEM_TYPES = new Set([
    ITEM_TYPE_CLOAK,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_MEDKIT,
    ITEM_TYPE_BOMB,
    ITEM_TYPE_MINE,
    ITEM_TYPE_ORB,
    ITEM_TYPE_FLARE,
    ITEM_TYPE_DFG,
]);

const HAZARD_ITEM_TYPES = new Set([
    ITEM_TYPE_MINE,
    ITEM_TYPE_BOMB,
    ITEM_TYPE_DFG,
]);

const getInitialLife = (type) => {
    if (Object.prototype.hasOwnProperty.call(ITEM_INITIAL_LIFE, type)) {
        return ITEM_INITIAL_LIFE[type];
    }
    return null;
};

const getBurnThreshold = (type) => {
    if (Object.prototype.hasOwnProperty.call(ITEM_BURN_THRESHOLDS, type)) {
        return ITEM_BURN_THRESHOLDS[type];
    }
    return null;
};

const playSound = (game, soundId, position) => {
    if (!game || !game.audio || !soundId) {
        return;
    }
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        game.audio.playEffect(soundId, { position });
    } else {
        game.audio.playEffect(soundId);
    }
};

class ItemFactory {

    constructor(game) {
        this.game = game;
        this.itemListHead = null;
        this.calculateTick = 0;
        this.itemsById = new Map();
        this.pendingHazards = new Set();
        this.pendingDefenseIds = new Set();
        this.socketBound = false;
        this.nextLocalId = 0;
        this.nextDefenseId = 0;

        this.validIcons = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
            ITEM_TYPE_WALL,
            ITEM_TYPE_MINE,
            ITEM_TYPE_BOMB,
            ITEM_TYPE_DFG,
            ITEM_TYPE_ORB
        ];

        this.validShooters = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
        ];

        this.pendingOrbItems = [];

        if (this.game.socketListener) {
            this.bindSocketEvents(this.game.socketListener);
        }
    }

    bindSocketEvents(socketListener) {
        if (!socketListener || this.socketBound) {
            return;
        }
        this.socketBound = true;
        socketListener.on('hazard:spawn', (hazard) => this.onHazardSpawn(hazard));
        socketListener.on('hazard:update', (hazard) => this.onHazardUpdate(hazard));
        socketListener.on('hazard:remove', (hazard) => this.onHazardRemove(hazard));
        socketListener.on('orb:result', (result) => this.onOrbResult(result));
    }

    generateHazardId() {
        this.nextLocalId += 1;
        const base = this.game.socketListener?.io?.id ?? 'local';
        return `hazard_${base}_${Date.now()}_${this.nextLocalId}`;
    }

    generateDefenseId() {
        this.nextDefenseId += 1;
        const base = this.game.socketListener?.io?.id ?? 'local';
        return `defense_${base}_${Date.now()}_${this.nextDefenseId}`;
    }

    insertItem(item) {
        if (this.itemListHead) {
            this.itemListHead.previous = item;
            item.next = this.itemListHead;
        }
        this.itemListHead = item;
        this.itemsById.set(item.id, item);
        this.game.forceDraw = true;
    }

    detachItem(item) {
        if (!item) {
            return;
        }
        if (item.next) {
            item.next.previous = item.previous;
        }
        if (item.previous) {
            item.previous.next = item.next;
        } else if (this.itemListHead === item) {
            this.itemListHead = item.next;
        }
        item.next = null;
        item.previous = null;
        this.itemsById.delete(item.id);
    }

    cycle() {

        if (this.game.tick > this.calculateTick) {
            this.calculateTick = this.game.tick + 200;
            var item = this.getHead();
            while (item) {
                if (this.validShooters.includes(item.type)) {
                    this.targetNearestPlayer(item);
                    this.fireBullet(item);
                }
                item = item.next;
            }
        }
        this.processBombs();
    }

    fireBullet(item) {
        if (!this.validShooters.includes(item.type)) {
            return;
        }

        if (this.game.tick > item.lastFired && item.target) {
            item.lastFired = this.game.tick + 250;

            var angle = ((item.angle) * 3.14) / 180;
            var direction = -((32 / 6) * angle);

            var x = (Math.sin((item.angle * 3.14) / 180));
            var y = (Math.cos((item.angle * 3.14) / 180) * -1);

            var x2 = ((item.x) + 20) + (x * 23);
            var y2 = ((item.y) + 24) + (y * 23);

            const shooterId = item.ownerId ?? item.owner ?? this.game.player.id;
            const shooterTeam = item.teamId ?? this.game.player.city ?? null;

            spawnMuzzleFlash(this.game, x2, y2);
            this.game.bulletFactory.newBullet(shooterId, x2, y2, 0, direction, shooterTeam, {
                sourceId: item.id ?? null,
                sourceType: this.resolveItemSourceType(item),
                targetId: item.target ?? null
            });
            playSound(this.game, this.resolveDefenseShotSound(item), { x: x2, y: y2 });
            this.emitItemBulletShot(item, {
                x: x2,
                y: y2,
                angle: direction,
                team: shooterTeam
            });
        }
    }

    useMedkit() {
        const playerId = this.game?.player?.id;
        if (playerId === null || playerId === undefined) {
            return false;
        }
        if (this.game?.player?.health >= MAX_HEALTH) {
            console.log("Health already full; medkit not consumed.");
            return false;
        }
        if (!this.game.iconFactory || typeof this.game.iconFactory.findOwnedIconByType !== 'function') {
            return false;
        }
        const icon = this.game.iconFactory.findOwnedIconByType(playerId, ITEM_TYPE_MEDKIT);
        if (!icon) {
            console.log("No MedKit available to use.");
            return false;
        }
        const iconId = icon.id ?? null;
        this.game.iconFactory.consumeOwnedIcon(playerId, ITEM_TYPE_MEDKIT, 1);
        if (this.game.player) {
            this.game.player.health = MAX_HEALTH;
            this.game.forceDraw = true;
        }
        if (this.game.socketListener && typeof this.game.socketListener.useItem === 'function') {
            this.game.socketListener.useItem('medkit', {
                iconId,
                type: ITEM_TYPE_MEDKIT
            });
        }
        return true;
    }

    activateCloak() {
        const playerId = this.game?.player?.id;
        if (playerId === null || playerId === undefined) {
            return false;
        }
        if (!this.game.iconFactory || typeof this.game.iconFactory.findOwnedIconByType !== 'function') {
            return false;
        }
        const icon = this.game.iconFactory.findOwnedIconByType(playerId, ITEM_TYPE_CLOAK);
        if (!icon) {
            console.log("Cloak unavailable.");
            return false;
        }
        const now = this.game.tick || Date.now();
        const expiresAt = now + TIMER_CLOAK;
        if (this.game.player) {
            this.game.player.isCloaked = true;
            this.game.player.cloakExpiresAt = expiresAt;
            this.game.forceDraw = true;
        }
        const offset = this.game.player?.offset;
        if (offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)) {
            playSound(this.game, SOUND_IDS.CLOAK, { x: offset.x + 24, y: offset.y + 24 });
        } else {
            playSound(this.game, SOUND_IDS.CLOAK);
        }
        if (this.game.socketListener && typeof this.game.socketListener.useItem === 'function') {
            this.game.socketListener.useItem('cloak', {
                iconId: icon.id ?? null,
                type: ITEM_TYPE_CLOAK,
                duration: TIMER_CLOAK
            });
        }
        return true;
    }

    freezeCurrentPlayer(duration = TIMER_DFG, source = 'dfg') {
        if (!this.game || !this.game.player) {
            return;
        }
        const now = this.game.tick || Date.now();
        this.game.player.isFrozen = true;
        this.game.player.frozenUntil = now + Math.max(0, duration);
        this.game.player.frozenBy = source;
        this.game.player.isMoving = 0;
        this.game.player.isTurning = 0;
        this.game.forceDraw = true;
    }

    triggerDFG(item) {
        if (!item || item.type !== ITEM_TYPE_DFG) {
            return;
        }
        item.active = false;
        item.armed = false;
        item.hidden = true;
        this.freezeCurrentPlayer();
        this.game.forceDraw = true;
    }

    targetNearestPlayer(item) {
        var nearest = null;
        const itemTeam = item.teamId ?? null;

        const considerPlayer = (playerRef, id) => {
            if (!playerRef || !playerRef.offset) {
                return;
            }

            const playerTeam = playerRef.city ?? null;
            if (itemTeam !== null && playerTeam === itemTeam) {
                return;
            }

            var dx = (playerRef.offset.x - item.x);
            var dy = (playerRef.offset.y - item.y);

            var distance = Math.sqrt((dx * dx) + (dy * dy));
            if (distance > 400) {
                return;
            }

            if (!nearest || distance < nearest.distance) {
                nearest = {
                    id: id,
                    x: playerRef.offset.x,
                    y: playerRef.offset.y,
                    distance: distance,
                    team: playerTeam
                };
            }
        };

        considerPlayer(this.game.player, this.game.player.id);
        Object.keys(this.game.otherPlayers).forEach((id) => {
            considerPlayer(this.game.otherPlayers[id], id);
        });
        if (this.game.rogueTankManager && Array.isArray(this.game.rogueTankManager.tanks)) {
            this.game.rogueTankManager.tanks.forEach((tank) => {
                if (!tank || !tank.offset) {
                    return;
                }
                considerPlayer(tank, tank.id || `rogue_${tank.offset.x}_${tank.offset.y}`);
            });
        }

        if (nearest) {
            item.target = nearest.id;
            item.targetTeam = nearest.team ?? null;

            var angle = Math.atan2(nearest.x - item.x, nearest.y - item.y);
            angle = Math.ceil((angle * 180 / 3.14));

            if (nearest.x >= item.x) {
                item.angle = 180 - angle;
            } else if (nearest.x <= item.x) {
                item.angle = (angle * -1) + 170;
            } else {
                item.angle = angle;
            }
        } else {
            item.target = null;
            item.targetTeam = null;
        }
    }

    ensureItemDurability(item, explicitType = null) {
        if (!item) {
            return;
        }
        const type = Number.isFinite(explicitType) ? explicitType : item.type;
        const initialLife = getInitialLife(type);
        if (initialLife !== null && initialLife !== undefined) {
            if (!Number.isFinite(item.maxLife)) {
                item.maxLife = initialLife;
            }
            if (!Number.isFinite(item.life)) {
                item.life = initialLife;
            }
        }
        const burnThreshold = getBurnThreshold(type);
        if (burnThreshold !== null && burnThreshold !== undefined) {
            if (!Number.isFinite(item.burnThreshold)) {
                item.burnThreshold = burnThreshold;
            }
        }
        if (!Object.prototype.hasOwnProperty.call(item, 'isBurning')) {
            item.isBurning = false;
        }
        if (
            Number.isFinite(item.life) &&
            Number.isFinite(item.burnThreshold) &&
            Number.isFinite(item.maxLife) &&
            item.life < item.maxLife &&
            item.life <= item.burnThreshold
        ) {
            this.markItemBurning(item);
        }
    }

    markItemBurning(item) {
        if (!item) {
            return;
        }
        if (item.isBurning) {
            return;
        }
        item.isBurning = true;
        item.lifeState = 'burning';
        if (!Number.isFinite(item.animation)) {
            item.animation = 1;
        }
        if (!Number.isFinite(item.animationTick)) {
            item.animationTick = 0;
        }
    }

    isHazardType(type) {
        return HAZARD_ITEM_TYPES.has(type);
    }

    shouldRemoveOnHit(type) {
        if (INSTANT_REMOVAL_ITEM_TYPES.has(type)) {
            return true;
        }
        return !STRUCTURE_ITEM_TYPES.has(type);
    }

    destroyItem(item, options = {}) {
        if (!item) {
            return;
        }
        const impactX = Number.isFinite(options.impactX) ? options.impactX : item.x;
        const impactY = Number.isFinite(options.impactY) ? options.impactY : item.y;
        if (options.spawnExplosion !== false) {
            this.spawnExplosion(impactX, impactY);
        }

        this.deleteItem(item, {
            notifyServer: options.notifyServer,
            reason: options.reason || 'destroyed'
        });
        this.game.forceDraw = true;
    }

    handleBulletHit(item, bullet) {
        if (!item || !bullet) {
            return { consumed: false };
        }
        if (bullet.sourceId && item.id && bullet.sourceId === item.id) {
            return { consumed: false };
        }

        const impactX = Number.isFinite(bullet.x) ? bullet.x : item.x;
        const impactY = Number.isFinite(bullet.y) ? bullet.y : item.y;
        const damage = Number.isFinite(bullet.damage) ? bullet.damage : 5;

        const response = {
            consumed: true,
            destroyed: false,
            type: item.type,
        };

        if (this.shouldRemoveOnHit(item.type)) {
            this.destroyItem(item, { impactX, impactY });
            response.destroyed = true;
            return response;
        }

        this.ensureItemDurability(item);

        if (!Number.isFinite(item.life)) {
            this.destroyItem(item, { impactX, impactY });
            response.destroyed = true;
            return response;
        }

        item.life -= damage;

        if (item.life <= 0) {
            this.destroyItem(item, { impactX, impactY });
            response.destroyed = true;
            return response;
        }

        if (Number.isFinite(item.burnThreshold) && item.life <= item.burnThreshold) {
            this.markItemBurning(item);
        }

        this.spawnExplosion(impactX, impactY);
        this.game.forceDraw = true;
        return response;
    }

    newItem(owner, x, y, type, options = {}) {

        if (!this.validIcons.includes(type)) {
            return null;
        }

        let ownerId = null;
        let ownerTeam = null;

        if (owner && typeof owner === 'object') {
            ownerId = owner.owner ?? owner.id ?? null;
            ownerTeam = owner.city ?? null;
        } else if (owner !== undefined) {
            ownerId = owner;
        }

        if (ownerTeam === null && ownerId !== null) {
            ownerTeam = this.game.player?.city ?? null;
        }

        if (options.teamId !== undefined && options.teamId !== null) {
            const override = Number(options.teamId);
            if (Number.isFinite(override)) {
                ownerTeam = Math.floor(override);
            }
        }
        if (!Number.isFinite(ownerTeam) && options.city !== undefined && options.city !== null) {
            const overrideCity = Number(options.city);
            if (Number.isFinite(overrideCity)) {
                ownerTeam = Math.floor(overrideCity);
            }
        }

        let adjustedX = x;
        let adjustedY = y;
        if (type === ITEM_TYPE_BOMB || type === ITEM_TYPE_MINE) {
            adjustedX = Math.floor(x / 48) * 48;
            adjustedY = Math.floor(y / 48) * 48;
        }

        const isHazard = HAZARD_ITEM_TYPES.has(type);
        const isDefense = DEFENSE_ITEM_TYPES.has(type);
        const shouldNotifyHazard = options.notifyServer !== false && isHazard;
        const shouldNotifyDefense = options.notifyServer !== false && !isHazard && isDefense;
        const generatedId = shouldNotifyHazard
            ? this.generateHazardId()
            : (shouldNotifyDefense ? this.generateDefenseId() : null);
        const itemId = options.id || generatedId || `item_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        const bombArmed = owner && typeof owner === 'object' && owner.armed !== undefined
            ? !!owner.armed
            : (this.game.player?.bombsArmed ?? false);

        const item = {
            id: itemId,
            owner: ownerId,
            ownerId,
            teamId: ownerTeam,
            city: ownerTeam,
            x: adjustedX,
            y: adjustedY,
            target: null,
            targetTeam: null,
            type: type,
            lastFired: 0,
            active: type === ITEM_TYPE_BOMB ? bombArmed : true,
            armed: type === ITEM_TYPE_BOMB ? bombArmed : true,
            detonateTick: options.detonateTick || null,
            next: null,
            previous: null,
            synced: !(shouldNotifyHazard || shouldNotifyDefense)
        };

        item.isDefense = isDefense;

        this.ensureItemDurability(item, type);

        this.insertItem(item);

        if (isDefense && !shouldNotifyDefense) {
            this.pendingDefenseIds.delete(item.id);
        }

        if (type === ITEM_TYPE_ORB && options.notifyServer !== false) {
            this.queueOrbDrop(item, {
                ownerId,
                teamId: ownerTeam
            });
        }

        if (shouldNotifyHazard && this.game.socketListener) {
            this.pendingHazards.add(item.id);
            this.game.socketListener.spawnHazard({
                id: item.id,
                type,
                x: item.x,
                y: item.y,
                armed: item.active,
                ownerId: ownerId,
                teamId: ownerTeam
            });
        }

        if (shouldNotifyDefense && this.game.socketListener && typeof this.game.socketListener.spawnDefense === 'function') {
            this.pendingDefenseIds.add(item.id);
            this.game.socketListener.spawnDefense({
                id: item.id,
                type,
                x: item.x,
                y: item.y,
                ownerId: ownerId,
                teamId: ownerTeam,
                cityId: ownerTeam,
                angle: item.angle ?? 0
            });
        }

        if (type === ITEM_TYPE_BOMB) {
            this.armBomb(item, item.active, { notifyServer: false });
        }

        return item;
    }

    shouldNotifyServerForItem(item) {
        if (!item || !this.game || !this.game.socketListener) {
            return false;
        }
        if (typeof this.game.socketListener.sendBulletShot !== 'function') {
            return false;
        }
        const localPlayerId = this.game.player?.id ?? null;
        if (!localPlayerId) {
            return false;
        }
        const ownerId = item.ownerId ?? item.owner ?? null;
        if (item.isDefense) {
            return true;
        }
        if (ownerId === null || ownerId === undefined) {
            return true;
        }
        return ownerId === localPlayerId;
    }

    resolveItemSourceType(item) {
        if (!item) {
            return null;
        }
        if (item.type === ITEM_TYPE_TURRET) {
            return 'turret';
        }
        if (item.type === ITEM_TYPE_PLASMA) {
            return 'plasma';
        }
        if (item.type === ITEM_TYPE_SLEEPER) {
            return 'sleeper';
        }
        return null;
    }

    resolveDefenseShotSound(item) {
        if (!item) {
            return SOUND_IDS.LASER;
        }
        if (item.type === ITEM_TYPE_TURRET || item.type === ITEM_TYPE_PLASMA || item.type === ITEM_TYPE_SLEEPER) {
            return SOUND_IDS.TURRET;
        }
        return SOUND_IDS.LASER;
    }

    resolveItemTeam(item, fallback = null) {
        if (!item) {
            return fallback;
        }
        const teamId = item.teamId ?? item.city ?? null;
        if (Number.isFinite(teamId)) {
            return teamId;
        }
        if (Number.isFinite(fallback)) {
            return fallback;
        }
        return this.game.player?.city ?? null;
    }

    emitItemBulletShot(item, shot) {
        if (!this.shouldNotifyServerForItem(item)) {
            return;
        }
        const socketListener = this.game.socketListener;
        if (!socketListener) {
            return;
        }
        const localPlayerId = this.game.player?.id ?? null;
        if (!localPlayerId) {
            return;
        }
        const payload = {
            shooter: localPlayerId,
            x: shot?.x ?? item.x,
            y: shot?.y ?? item.y,
            type: shot?.type ?? 0,
            angle: shot?.angle ?? 0,
            team: this.resolveItemTeam(item, shot?.team ?? null),
            sourceId: item.id ?? null,
            sourceType: this.resolveItemSourceType(item) || undefined,
            targetId: item.target ?? null
        };
        socketListener.sendBulletShot(payload);
    }


    deleteItem(item, options = {}) {
        if (!item) {
            return null;
        }
        const notifyServer = options.notifyServer !== false;
        const removalReason = (typeof options.reason === 'string' && options.reason.trim().length)
            ? options.reason.trim()
            : null;
        const returnItem = item.next;
        if (Array.isArray(this.pendingOrbItems)) {
            const index = this.pendingOrbItems.indexOf(item);
            if (index !== -1) {
                this.pendingOrbItems.splice(index, 1);
            }
        }
        if (notifyServer && this.isHazardType(item.type) && this.game.socketListener && typeof this.game.socketListener.removeHazard === 'function') {
            try {
                const hazardPayload = removalReason ? { id: item.id, reason: removalReason } : item.id;
                this.game.socketListener.removeHazard(hazardPayload);
            } catch (error) {
                console.debug("Failed to notify server about hazard removal", error);
            }
        }
        if (notifyServer && item.isDefense && this.game.socketListener && typeof this.game.socketListener.removeDefense === 'function') {
            try {
                this.game.socketListener.removeDefense(item.id);
            } catch (error) {
                console.debug("Failed to notify server about defense removal", error);
            }
        }
        this.detachItem(item);
        this.pendingHazards.delete(item.id);
        if (this.pendingDefenseIds) {
            this.pendingDefenseIds.delete(item.id);
        }
        if (item.type === ITEM_TYPE_ORB) {
            const skipNotification = removalReason === 'orb_detonated' || removalReason === 'picked_up';
            if (!skipNotification) {
                this.notifyOrbDestroyed(item, { reason: removalReason || 'destroyed' });
            }
        }
        return returnItem;
    }

    pickupOrbItem() {
        const player = this.game?.player;
        if (!player || !player.id) {
            return false;
        }
        const orbItem = player.collidedItem;
        if (!orbItem || orbItem.type !== ITEM_TYPE_ORB) {
            return false;
        }
        const iconFactory = this.game.iconFactory;
        if (!iconFactory || typeof iconFactory.getAllowedQuantity !== 'function') {
            return false;
        }
        const playerTeam = player.city ?? null;
        const itemTeam = this.resolveItemTeam(orbItem, null);
        if (itemTeam !== null && playerTeam !== null && itemTeam !== playerTeam) {
            return false;
        }
        const allowed = iconFactory.getAllowedQuantity(player.id, ITEM_TYPE_ORB, 1);
        if (allowed <= 0) {
            return false;
        }
        let icon = iconFactory.findOwnedIconByType(player.id, ITEM_TYPE_ORB);
        if (icon) {
            const limit = (typeof iconFactory.getLimitForType === 'function')
                ? iconFactory.getLimitForType(ITEM_TYPE_ORB)
                : Infinity;
            const current = Number.isFinite(icon.quantity)
                ? icon.quantity
                : parseInt(icon.quantity, 10) || 1;
            const incremented = Math.max(1, current + 1);
            icon.quantity = Number.isFinite(limit)
                ? Math.min(limit, incremented)
                : incremented;
            icon.selected = true;
        } else if (typeof iconFactory.newIcon === 'function') {
            icon = iconFactory.newIcon(player.id, player.offset?.x ?? 0, player.offset?.y ?? 0, ITEM_TYPE_ORB, {
                quantity: 1,
                selected: true,
                skipProductionUpdate: true,
                synced: true,
                city: playerTeam,
                teamId: playerTeam
            });
        }
        if (!icon) {
            return false;
        }
        if (typeof iconFactory.getHead === 'function') {
            let node = iconFactory.getHead();
            while (node) {
                if (node !== icon && node.owner === player.id) {
                    node.selected = false;
                    if (node.type === ITEM_TYPE_BOMB) {
                        node.armed = false;
                    }
                }
                node = node.next;
            }
        }
        if (player && this.game?.player === player) {
            player.bombsArmed = false;
        }
        this.deleteItem(orbItem, { notifyServer: false, reason: 'picked_up' });
        player.collidedItem = null;
        this.game.forceDraw = true;
        return true;
    }

    pickupFriendlyMine() {
        const player = this.game?.player;
        if (!player || !player.id) {
            return false;
        }
        const mine = player.collidedItem;
        if (!mine || mine.type !== ITEM_TYPE_MINE) {
            return false;
        }
        const playerTeam = player.city ?? null;
        const mineTeam = this.resolveItemTeam(mine, null);
        if (mineTeam !== null && playerTeam !== null && mineTeam !== playerTeam) {
            return false;
        }

        const iconFactory = this.game?.iconFactory;
        if (!iconFactory || typeof iconFactory.getAllowedQuantity !== 'function') {
            return false;
        }
        const allowed = iconFactory.getAllowedQuantity(player.id, ITEM_TYPE_MINE, 1);
        if (allowed <= 0) {
            return false;
        }

        let icon = iconFactory.findOwnedIconByType(player.id, ITEM_TYPE_MINE);
        if (icon) {
            const limit = (typeof iconFactory.getLimitForType === 'function')
                ? iconFactory.getLimitForType(ITEM_TYPE_MINE)
                : Infinity;
            const current = Number.isFinite(icon.quantity)
                ? icon.quantity
                : parseInt(icon.quantity, 10) || 1;
            const incremented = Math.max(1, current + 1);
            icon.quantity = Number.isFinite(limit)
                ? Math.min(limit, incremented)
                : incremented;
            icon.selected = true;
        } else if (typeof iconFactory.newIcon === 'function') {
            icon = iconFactory.newIcon(player.id, player.offset?.x ?? 0, player.offset?.y ?? 0, ITEM_TYPE_MINE, {
                quantity: 1,
                selected: true,
                skipProductionUpdate: true,
                synced: true,
                city: playerTeam,
                teamId: playerTeam
            });
        }

        if (!icon) {
            return false;
        }

        if (typeof iconFactory.getHead === 'function') {
            let node = iconFactory.getHead();
            while (node) {
                if (node !== icon && node.owner === player.id) {
                    node.selected = false;
                    if (node.type === ITEM_TYPE_BOMB) {
                        node.armed = false;
                    }
                }
                node = node.next;
            }
        }

        player.bombsArmed = false;
        this.deleteItem(mine, { notifyServer: true, reason: 'picked_up' });
        player.collidedItem = null;
        this.game.forceDraw = true;
        return true;
    }

    processBombs() {
        // Bomb timers and detonations are handled by the server.
    }

    armBomb(item, armed, options = {}) {
        if (!item || item.type !== ITEM_TYPE_BOMB) {
            return;
        }
        item.active = armed;
        item.armed = armed;
        if (options.notifyServer !== false && this.game.socketListener && item.id) {
            this.game.socketListener.updateHazard({ id: item.id, armed: !!armed });
        }
    }

    detonateBomb(item, options = {}) {
        const notifyServer = options.notifyServer !== undefined ? !!options.notifyServer : true;
        const centerTileX = Math.floor((item.x + 24) / 48);
        const centerTileY = Math.floor((item.y + 24) / 48);

        console.log(`Bomb detonated at tile ${centerTileX}, ${centerTileY}`);

        let nextItem = this.deleteItem(item, { notifyServer });

        // Remove nearby items
        let node = this.getHead();
        while (node) {
            const next = node.next;
            const tileX = Math.floor((node.x + 24) / 48);
            const tileY = Math.floor((node.y + 24) / 48);
            if (Math.abs(tileX - centerTileX) <= BOMB_ITEM_TILE_RADIUS &&
                Math.abs(tileY - centerTileY) <= BOMB_ITEM_TILE_RADIUS) {
                this.deleteItem(node, { notifyServer });
            }
            node = next;
        }

        // Damage buildings
        let building = this.game.buildingFactory.getHead();
        while (building) {
            const diffX = Math.floor(building.x) - centerTileX;
            const diffY = Math.floor(building.y) - centerTileY;
            if (Math.abs(diffX) <= BOMB_EXPLOSION_TILE_RADIUS &&
                Math.abs(diffY) <= BOMB_EXPLOSION_TILE_RADIUS) {
                if (building.type === BUILDING_COMMAND_CENTER) {
                    building = building.next;
                    continue;
                }
                building = this.game.buildingFactory.deleteBuilding(building, notifyServer);
                continue;
            }
            building = building.next;
        }

        this.damagePlayersInRadius(centerTileX, centerTileY);
        this.game.forceDraw = true;
        return nextItem;
    }

    damagePlayersInRadius() {
        // Damage is applied authoritatively on the server.
    }

    queueOrbDrop(item, metadata = {}) {
        if (!item || !this.game || !this.game.socketListener) {
            return;
        }
        const localPlayerId = this.game.player?.id ?? null;
        const ownerId = metadata.ownerId ?? item.ownerId ?? localPlayerId;
        if (!localPlayerId || ownerId !== localPlayerId) {
            return;
        }

        if (!Array.isArray(this.pendingOrbItems)) {
            this.pendingOrbItems = [];
        }
        this.pendingOrbItems.push(item);
        item.pendingOrbCheck = true;

        const payload = {
            id: item.id,
            x: item.x,
            y: item.y,
            ownerId,
            city: metadata.teamId ?? item.teamId ?? this.game.player?.city ?? null,
            type: ITEM_TYPE_ORB
        };
        this.game.socketListener.sendOrbDrop(payload);
    }

    triggerMine(item) {
        if (!item || item.type !== ITEM_TYPE_MINE) {
            return;
        }
        item.active = false;
        item.armed = false;
        item.hidden = true;
        this.game.forceDraw = true;
    }

    onHazardSpawn(hazard) {
        if (!hazard || !hazard.id) {
            return;
        }

        let item = this.itemsById.get(hazard.id);
        if (!item) {
            const type = this.resolveItemType(hazard.type);
            item = this.newItem(null, hazard.x, hazard.y, type, {
                id: hazard.id,
                notifyServer: false,
                detonateTick: hazard.detonateAt ? hazard.detonateAt : null
            });
            if (!item) {
                return;
            }
        }

        this.applyHazardState(item, hazard);
        item.synced = true;
        this.pendingHazards.delete(hazard.id);
    }

    onHazardUpdate(hazard) {
        if (!hazard || !hazard.id) {
            return;
        }
        const item = this.itemsById.get(hazard.id);
        if (!item) {
            this.onHazardSpawn(hazard);
            return;
        }
        this.applyHazardState(item, hazard);
    }

    onHazardRemove(hazard) {
        if (!hazard || !hazard.id) {
            return;
        }
        const item = this.itemsById.get(hazard.id);
        if (!item) {
            return;
        }

        if (hazard.reason === 'bomb_detonated') {
            this.spawnExplosion(hazard.x ?? item.x, hazard.y ?? item.y);
        }
        if (hazard.reason === 'dfg_triggered' && hazard.triggeredBy) {
            const myId = this.game.player?.id;
            if (hazard.triggeredBy === myId) {
                this.freezeCurrentPlayer();
            }
        }
        this.deleteItem(item, { notifyServer: false });
        this.game.forceDraw = true;
    }

    onOrbResult(result) {
        if (!Array.isArray(this.pendingOrbItems) || !this.pendingOrbItems.length) {
            return;
        }
        const item = this.pendingOrbItems.shift();
        if (!item) {
            return;
        }
        item.pendingOrbCheck = false;

        const payload = result || {};
        if (payload.status !== 'detonated') {
            return;
        }

        this.spawnExplosion(item.x, item.y);
        this.deleteItem(item, { notifyServer: false, reason: 'orb_detonated' });
        this.game.forceDraw = true;
    }

    notifyOrbDestroyed(item, meta = {}) {
        if (!item || item._orbDestroyedNotified) {
            return;
        }
        item._orbDestroyedNotified = true;
        const socketListener = this.game?.socketListener;
        if (!socketListener || typeof socketListener.reportOrbLoss !== 'function') {
            return;
        }
        const payload = {
            itemId: item.id ?? null,
            ownerId: item.ownerId ?? item.owner ?? null,
            cityId: this.resolveItemTeam(item, null),
            reason: meta.reason || 'destroyed'
        };
        socketListener.reportOrbLoss(payload);
    }

    applyHazardState(item, hazard) {
        item.x = this.toFiniteNumber(hazard.x, item.x);
        item.y = this.toFiniteNumber(hazard.y, item.y);
        applyHazardMetadata(item, hazard, (value, fallback) => this.toFiniteNumber(value, fallback));
        if (hazard.active !== undefined) {
            item.active = !!hazard.active;
        }
        if (hazard.armed !== undefined) {
            item.armed = !!hazard.armed;
        }
        if (hazard.detonateAt) {
            item.detonateTick = hazard.detonateAt;
        }
        if (hazard.life !== undefined) {
            const nextLife = this.toFiniteNumber(hazard.life, item.life);
            if (Number.isFinite(nextLife)) {
                item.life = nextLife;
            }
        }
        if (hazard.revealedAt !== undefined) {
            const revealedTick = this.toFiniteNumber(hazard.revealedAt, item.revealedAt ?? null);
            item.revealedAt = Number.isFinite(revealedTick) ? revealedTick : null;
        }
        if (hazard.triggeredBy !== undefined) {
            item.triggeredBy = hazard.triggeredBy ?? null;
        }
        if (hazard.triggeredTeam !== undefined) {
            item.triggeredTeam = hazard.triggeredTeam ?? null;
        }
        this.ensureItemDurability(item);
    }

    resolveItemType(hazardType) {
        if (hazardType === 'mine' || hazardType === ITEM_TYPE_MINE || hazardType === 4) {
            return ITEM_TYPE_MINE;
        }
        if (hazardType === 'bomb' || hazardType === ITEM_TYPE_BOMB || hazardType === 3) {
            return ITEM_TYPE_BOMB;
        }
        if (hazardType === 'dfg' || hazardType === ITEM_TYPE_DFG || hazardType === 7) {
            return ITEM_TYPE_DFG;
        }
        return ITEM_TYPE_MINE;
    }

    spawnExplosion(x, y) {
        if (!this.game || !Array.isArray(this.game.explosions)) {
            return;
        }
        this.game.explosions.push({
            x,
            y,
            frame: 0,
            nextFrameTick: null,
            variant: 'small'
        });
        playSound(this.game, SOUND_IDS.EXPLOSION, { x, y });
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
        return fallback;
    }


    getHead() {
        return this.itemListHead;
    }

    getItemById(id) {
        if (!id) {
            return null;
        }
        return this.itemsById.get(id) || null;
    }

    removeItemById(id, options = {}) {
        const item = this.getItemById(id);
        if (!item) {
            return false;
        }
        this.deleteItem(item, options);
        return true;
    }
}


export default ItemFactory;

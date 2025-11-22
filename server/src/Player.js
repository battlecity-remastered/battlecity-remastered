/*jslint node: true */
"use strict";

const { MAX_HEALTH } = require("./gameplay/constants");

class Player {

    constructor(id, player, now) {
        this.id = id;
        this.city = 0;
        this.isMayor = false;
        this.health = MAX_HEALTH;
        this.direction = 0;
        this.isTurning = 0;
        this.isMoving = 0;
        this.offset = {
            x: 0,
            y: 0
        };
        this.sequence = 0;
        this.isCloaked = false;
        this.cloakExpiresAt = 0;
        this.isFrozen = false;
        this.frozenUntil = 0;
        this.frozenBy = null;
        this.lastHospitalHealAt = 0;
        this.isSystemControlled = false;
        this.isFake = false;
        this.isFakeRecruit = false;
        this.type = null;
        this.points = 0;
        this.rankTitle = null;
        this.userId = this._sanitizeId(player && (player.userId || (player.identity && player.identity.id)));
        this.callsign = this._sanitizeCallsign(player && player.callsign);
        this.lastUpdateAt = now || Date.now();
        this.update(player, this.lastUpdateAt);
    }

    update(player, now) {
        if (!player) {
            return;
        }

        const previousOffset = {
            x: this.offset?.x ?? 0,
            y: this.offset?.y ?? 0
        };

        if (player.offset && typeof player.offset === 'object') {
            const x = this._toFiniteNumber(player.offset.x, this.offset.x);
            const y = this._toFiniteNumber(player.offset.y, this.offset.y);
            this.offset = {
                x: x,
                y: y
            };
        }

        this.direction = this._toFiniteNumber(player.direction, this.direction);
        this.isTurning = this._toFiniteNumber(player.isTurning, this.isTurning);

        if (typeof player.isMoving === 'boolean') {
            this.isMoving = player.isMoving ? 1 : 0;
        } else {
            this.isMoving = this._toFiniteNumber(player.isMoving, this.isMoving);
        }

        if (player.city !== undefined) {
            this.city = this._toFiniteNumber(player.city, this.city);
        }

        if (player.isMayor !== undefined) {
            this.isMayor = !!player.isMayor;
        }

        if (player.points !== undefined) {
            const numericPoints = this._toFiniteNumber(player.points, this.points);
            if (Number.isFinite(numericPoints)) {
                this.points = Math.max(0, Math.floor(numericPoints));
            }
        }

        if (player.rankTitle !== undefined) {
            const title = typeof player.rankTitle === 'string' ? player.rankTitle.trim() : null;
            this.rankTitle = title && title.length ? title : this.rankTitle;
        }

        if (player.callsign) {
            const nextCallsign = this._sanitizeCallsign(player.callsign, this.callsign);
            if (nextCallsign) {
                this.callsign = nextCallsign;
            }
        }

        if (player.userId || (player.identity && player.identity.id)) {
            const nextId = this._sanitizeId(player.userId || (player.identity && player.identity.id));
            if (nextId) {
                this.userId = nextId;
            }
        }

        if (player.sequence !== undefined) {
            const sequenceValue = this._toFiniteNumber(player.sequence, this.sequence);
            if (Number.isFinite(sequenceValue)) {
                this.sequence = Math.max(0, Math.round(sequenceValue));
            }
        }

        this.lastUpdateAt = now || Date.now();

        if (this.isFrozen) {
            if (!this.frozenUntil || this.lastUpdateAt >= this.frozenUntil) {
                this.isFrozen = false;
                this.frozenUntil = 0;
                this.frozenBy = null;
            } else {
                this.offset = previousOffset;
                this.isMoving = 0;
            }
        }

        if (this.isCloaked && this.cloakExpiresAt && this.lastUpdateAt >= this.cloakExpiresAt) {
            this.isCloaked = false;
            this.cloakExpiresAt = 0;
        }
    }

    cycle() {

    }

    toJSON() {
        const payload = {
            id: this.id,
            city: this.city,
            isMayor: this.isMayor,
            health: this.health,
            direction: this.direction,
            isTurning: this.isTurning,
            isMoving: this.isMoving,
            isCloaked: this.isCloaked,
            cloakExpiresAt: this.cloakExpiresAt,
            isFrozen: this.isFrozen,
            frozenUntil: this.frozenUntil,
            sequence: this.sequence,
            offset: {
                x: this.offset.x,
                y: this.offset.y
            }
        };
        if (this.isSystemControlled) {
            payload.isSystemControlled = true;
        }
        if (this.isFake) {
            payload.isFake = true;
        }
        if (this.isFakeRecruit) {
            payload.isFakeRecruit = true;
        }
        if (this.type) {
            payload.type = this.type;
        }
        if (this.ownerId !== undefined) {
            payload.ownerId = this.ownerId;
        }
        if (this.callsign) {
            payload.callsign = this.callsign;
        }
        if (this.userId) {
            payload.userId = this.userId;
        }
        if (Number.isFinite(this.points)) {
            payload.points = this.points;
        }
        if (this.rankTitle) {
            payload.rankTitle = this.rankTitle;
        }
        return payload;
    }

    _toFiniteNumber(value, fallback) {
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

    _sanitizeCallsign(value, fallback = null) {
        if (!value || typeof value !== 'string') {
            return fallback;
        }
        const trimmed = value.trim();
        if (!trimmed.length) {
            return fallback;
        }
        return trimmed.slice(0, 48);
    }

    _sanitizeId(value) {
        if (!value) {
            return null;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        }
        return String(value);
    }
}

module.exports = Player;

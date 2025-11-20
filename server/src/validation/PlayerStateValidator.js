/*jslint node: true */
"use strict";

const DEFAULT_OPTIONS = {
    minMapCoordinate: 0,
    maxMapCoordinate: 511 * 48,
    speedPerMs: 0.50,
    maxAxisDelta: 20,
    snapAllowance: 96,
    frameToleranceMs: 50,
    maxDirectionIndex: 31,
    directionSlots: 32,
    maxTurnDelta: 4,
    minHealth: 0,
    maxHealth: 40
};

class PlayerStateValidator {

    constructor(options) {
        this.options = Object.assign({}, DEFAULT_OPTIONS, options || {});
        this.axisHardCap = this.options.maxAxisDelta + this.options.snapAllowance;
        this.game = this.options.game || null; // Inject game instance for collision checks
    }

    initializePlayerState(rawState, context) {
        return this._validate(null, rawState, context);
    }

    validatePlayerUpdate(existingPlayer, rawState, context) {
        return this._validate(existingPlayer, rawState, context);
    }

    _validate(existingPlayer, rawState, context) {
        const now = (context && context.now) || Date.now();
        const previousState = existingPlayer || null;

        const sequenceValue = this._sanitizeInteger(rawState && rawState.sequence, previousState && previousState.sequence, 0);
        const normalizedSequence = Number.isFinite(sequenceValue) ? Math.max(0, sequenceValue) : (previousState && Number.isFinite(previousState.sequence) ? previousState.sequence : 0);

        const sanitized = {
            id: (rawState && rawState.id) || (previousState && previousState.id) || null,
            city: this._sanitizeInteger(rawState && rawState.city, previousState && previousState.city, 0),
            isMayor: this._sanitizeBoolean(rawState && rawState.isMayor, previousState && previousState.isMayor, false),
            health: this._sanitizeRange(rawState && rawState.health, previousState && previousState.health, this.options.minHealth, this.options.maxHealth, this.options.maxHealth),
            direction: this._sanitizeDirection(rawState && rawState.direction, previousState && previousState.direction, 0),
            isTurning: this._sanitizeTurn(rawState && rawState.isTurning, previousState && previousState.isTurning, 0),
            isMoving: this._sanitizeMovement(rawState && rawState.isMoving, previousState && previousState.isMoving, 0),
            offset: this._sanitizeOffset(rawState && rawState.offset, previousState && previousState.offset),
            sequence: normalizedSequence
        };

        const result = {
            valid: true,
            sanitized: sanitized,
            reasons: [],
            flags: [],
            timestamp: now
        };

        if (!previousState) {
            return result;
        }

        const previousOffset = previousState.offset || { x: 0, y: 0 };
        const delta = {
            x: sanitized.offset.x - previousOffset.x,
            y: sanitized.offset.y - previousOffset.y
        };

        const elapsed = Math.max(1, now - (previousState.lastUpdateAt || now));
        const maxAxisMovement = this._computeAxisLimit(elapsed);
        const totalDistance = Math.sqrt((delta.x * delta.x) + (delta.y * delta.y));
        const isFake = !!(previousState.isFake || previousState.isFakeRecruit || previousState.isSystemControlled);
        let maxDistance = Math.min(this.axisHardCap, Math.max(maxAxisMovement, this.options.maxAxisDelta));
        if (isFake) {
            const boost = elapsed < 200 ? this.options.maxAxisDelta * 4 : this.options.maxAxisDelta * 2;
            maxDistance = Math.min(this.axisHardCap, Math.max(maxDistance, boost));
        }

        if (Math.abs(delta.x) > maxDistance || Math.abs(delta.y) > maxDistance || totalDistance > (maxDistance + 8)) {
            result.valid = false;
            result.reasons.push("movement/exceeds_threshold");
            sanitized.offset = {
                x: previousOffset.x,
                y: previousOffset.y
            };
            result.flags.push("movement_clamped");
        } else if (this._checkCollision(sanitized.offset)) {
            // [SECURITY] Collision Check
            // If new position collides with map or building, reject it.
            result.valid = false;
            result.reasons.push("movement/collision");
            sanitized.offset = {
                x: previousOffset.x,
                y: previousOffset.y
            };
            result.flags.push("collision_detected");
        }

        const directionDelta = this._directionDelta(previousState.direction, sanitized.direction);
        const maxTurn = isFake ? this.options.maxTurnDelta * 4 : this.options.maxTurnDelta;
        if (directionDelta > maxTurn) {
            result.valid = false;
            result.reasons.push("direction/exceeds_threshold");
            sanitized.direction = previousState.direction;
            result.flags.push("direction_clamped");
        }

        return result;
    }

    _computeAxisLimit(elapsedMs) {
        if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
            return this.options.maxAxisDelta;
        }
        const paddedElapsed = elapsedMs + this.options.frameToleranceMs;
        const projected = paddedElapsed * this.options.speedPerMs;
        if (!Number.isFinite(projected)) {
            return this.options.maxAxisDelta;
        }
        return Math.min(this.axisHardCap, Math.max(this.options.maxAxisDelta, projected));
    }

    _sanitizeOffset(offset, fallback) {
        const base = fallback || { x: 0, y: 0 };
        if (!offset || typeof offset !== "object") {
            return {
                x: base.x,
                y: base.y
            };
        }

        return {
            x: this._clamp(this._toFiniteNumber(offset.x, base.x), this.options.minMapCoordinate, this.options.maxMapCoordinate),
            y: this._clamp(this._toFiniteNumber(offset.y, base.y), this.options.minMapCoordinate, this.options.maxMapCoordinate)
        };
    }

    _sanitizeDirection(direction, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(direction, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        let normalised = Math.round(rawValue);
        const modulo = this.options.directionSlots;
        if (modulo > 0) {
            normalised = ((normalised % modulo) + modulo) % modulo;
        }
        return normalised;
    }

    _sanitizeTurn(turn, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(turn, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        if (rawValue > 1) {
            return 1;
        }
        if (rawValue < -1) {
            return -1;
        }
        return Math.round(rawValue);
    }

    _sanitizeMovement(movement, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        if (typeof movement === "boolean") {
            return movement ? 1 : 0;
        }
        const rawValue = this._toFiniteNumber(movement, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        if (rawValue > 1) {
            return 1;
        }
        if (rawValue < -1) {
            return -1;
        }
        return rawValue;
    }

    _sanitizeInteger(value, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(value, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        return Math.round(rawValue);
    }

    _sanitizeBoolean(value, fallback, defaultValue) {
        if (value === undefined) {
            if (fallback !== undefined) {
                return !!fallback;
            }
            return !!defaultValue;
        }
        return !!value;
    }

    _sanitizeRange(value, fallback, min, max, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(value, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        return this._clamp(rawValue, min, max);
    }

    _directionDelta(previous, current) {
        if (!Number.isFinite(previous) || !Number.isFinite(current)) {
            return 0;
        }
        const modulo = this.options.directionSlots;
        if (modulo <= 0) {
            return Math.abs(current - previous);
        }
        const forward = ((current - previous) + modulo) % modulo;
        const backward = ((previous - current) + modulo) % modulo;
        return Math.min(forward, backward);
    }

    _toFiniteNumber(value, fallback) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string") {
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

    _clamp(value, min, max) {
        if (!Number.isFinite(value)) {
            return (min + max) / 2;
        }
        if (value < min) {
            return min;
        }
        if (value > max) {
            return max;
        }
        return value;
    }
    _checkCollision(offset) {
        if (!this.game) {
            return false;
        }

        const TILE_SIZE = 48;
        const SPRITE_GAP = 8;
        const rect = {
            x: offset.x + SPRITE_GAP,
            y: offset.y + SPRITE_GAP,
            w: TILE_SIZE - (SPRITE_GAP * 2),
            h: TILE_SIZE - (SPRITE_GAP * 2)
        };

        // 1. Check Map Boundaries
        if (rect.x < 0 || rect.y < 0 || (rect.x + rect.w) > (512 * TILE_SIZE) || (rect.y + rect.h) > (512 * TILE_SIZE)) {
            return true;
        }

        // 2. Check Map Tiles (Terrain)
        if (this.game.map) {
            const left = Math.floor(rect.x / TILE_SIZE);
            const right = Math.floor((rect.x + rect.w) / TILE_SIZE);
            const top = Math.floor(rect.y / TILE_SIZE);
            const bottom = Math.floor((rect.y + rect.h) / TILE_SIZE);

            const isBlocked = (x, y) => {
                try {
                    // 0 = Empty, 3 = Water (passable?), others blocked.
                    // Assuming 0 is empty. Need to verify what blocks.
                    // Usually 1=Brick, 2=Steel, 3=Water, 4=Ice, 5=Trees.
                    // Tanks block on Brick(1), Steel(2), Water(3).
                    // Trees(5) and Ice(4) might be passable.
                    const tile = this.game.map[x][y];
                    return tile === 1 || tile === 2 || tile === 3;
                } catch (e) {
                    return true; // Out of bounds
                }
            };

            if (isBlocked(left, top) || isBlocked(left, bottom) || isBlocked(right, top) || isBlocked(right, bottom)) {
                return true;
            }
        }

        // 3. Check Buildings
        if (this.game.buildingFactory && this.game.buildingFactory.buildings) {
            for (const building of this.game.buildingFactory.buildings.values()) {
                const buildingRect = {
                    x: building.x * TILE_SIZE,
                    y: building.y * TILE_SIZE,
                    w: TILE_SIZE * 3, // Buildings are 3x3
                    h: TILE_SIZE * 3
                };

                // Simple AABB collision
                if (rect.x < buildingRect.x + buildingRect.w &&
                    rect.x + rect.w > buildingRect.x &&
                    rect.y < buildingRect.y + buildingRect.h &&
                    rect.y + rect.h > buildingRect.y) {
                    return true;
                }
            }
        }

        return false;
    }
}

module.exports = PlayerStateValidator;

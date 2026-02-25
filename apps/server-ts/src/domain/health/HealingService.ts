import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

const PLAYER_HITBOX_GAP = 8;
const HOSPITAL_FOOTPRINT_TILES = 3;

type Rect = {
    x: number;
    y: number;
    w: number;
    h: number;
};

const rectangleCollision = (left: Rect, right: Rect): boolean => {
    if ((left.x + left.w) <= right.x) {
        return false;
    }
    if ((right.x + right.w) <= left.x) {
        return false;
    }
    if ((left.y + left.h) <= right.y) {
        return false;
    }
    if ((right.y + right.h) <= left.y) {
        return false;
    }
    return true;
};

const getPlayerRect = (x: number, y: number, tileSize: number): Rect => {
    const playerHitboxSize = Math.max(1, tileSize - (PLAYER_HITBOX_GAP * 2));
    return {
        x: Math.floor(x + PLAYER_HITBOX_GAP),
        y: Math.floor(y + PLAYER_HITBOX_GAP),
        w: playerHitboxSize,
        h: playerHitboxSize
    };
};

const parseBuildingType = (value: number): number => {
    if (!Number.isFinite(value)) {
        return Number.NaN;
    }
    return Math.floor(value);
};

const isHospitalBuildingType = (
    type: number,
    config: RuntimeConfig
): boolean => {
    const numericType = parseBuildingType(type);
    if (!Number.isFinite(numericType)) {
        return false;
    }
    if (numericType === config.hospitalBuildingType) {
        return true;
    }

    // Legacy parity: older maps/schema may store hospital as 301.
    const expanded = (numericType >= 0 && numericType < 100)
        ? numericType * 100
        : numericType;
    if (expanded === 301) {
        return true;
    }
    const family = Math.floor(expanded / 100);
    return family === 2 && expanded >= 200 && expanded < 300;
};

const getHospitalDriveableRect = (tileX: number, tileY: number, tileSize: number): Rect => {
    return {
        x: tileX * tileSize,
        y: (tileY * tileSize) + (tileSize * 2),
        w: tileSize * HOSPITAL_FOOTPRINT_TILES,
        h: tileSize
    };
};

export const tickHospitalHealing = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    now = Date.now()
): void => {
    const tileSize = Math.max(1, Math.floor(config.tileSize));
    for (const [playerId, player] of state.players.entries()) {
        if (!player || player.health <= 0) {
            continue;
        }
        if (player.health >= player.maxHealth) {
            continue;
        }
        const playerRect = getPlayerRect(player.x, player.y, tileSize);

        for (const building of state.buildings.values()) {
            if (!isHospitalBuildingType(building.type, config)) {
                continue;
            }
            const healZone = getHospitalDriveableRect(building.tileX, building.tileY, tileSize);
            if (!rectangleCollision(playerRect, healZone)) {
                continue;
            }

            const lastHealAt = Number.isFinite(player.lastHospitalHealAt)
                ? player.lastHospitalHealAt as number
                : 0;
            if (now < (lastHealAt + config.hospitalHealIntervalMs)) {
                break;
            }

            const healed = Math.min(player.maxHealth, player.health + config.hospitalHealPerTick);
            if (healed <= player.health) {
                break;
            }

            state.players.set(playerId, {
                ...player,
                health: healed,
                lastHospitalHealAt: now
            });
            emitter.emit("player.health", {
                id: playerId,
                health: healed,
                maxHealth: player.maxHealth,
                source: "hospital"
            });
            break;
        }
    }
};

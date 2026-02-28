import type {
    KnownEventPayloadByType,
    KnownTypedEventEnvelope
} from "@battlecity/protocol";
import type { ClientState } from "./state.js";
import { updateFromSnapshot } from "./state.js";
import { resolveBulletSpeed } from "../gameplay/bullets/BulletClientService.js";
import { resolveCitySpawn } from "../world/city-spawn.js";
import { auxHandlers } from "./network-event-handlers-state-sync.js";

type EventHandler<TType extends keyof KnownEventPayloadByType> =
    (state: ClientState, payload: KnownEventPayloadByType[TType]) => void;

const TILE_SIZE = 48;
const BUILDING_CENTER_OFFSET = TILE_SIZE * 1.5;

const setHealth = (state: ClientState, playerId: string, health: number, maxHealth: number): void => {
    if (playerId === state.local.id) {
        state.local.health = health;
        state.local.maxHealth = maxHealth;
        return;
    }

    const remote = state.remotePlayers.get(playerId);
    if (!remote) {
        return;
    }
    remote.health = health;
    remote.maxHealth = maxHealth;
};

const resolveMaxHealth = (state: ClientState, playerId: string): number => {
    if (playerId === state.local.id) {
        return state.local.maxHealth;
    }
    return state.remotePlayers.get(playerId)?.maxHealth ?? 100;
};

const pushExplosion = (
    state: ClientState,
    x: number,
    y: number,
    variant: "small" | "large"
): void => {
    state.events.effects.explosions.push({
        id: `${Date.now()}:${Math.random()}`,
        x,
        y,
        createdAt: Date.now(),
        variant
    });
    if (state.events.effects.explosions.length > 24) {
        state.events.effects.explosions.shift();
    }
};

const pushFloatingPoints = (
    state: ClientState,
    x: number,
    y: number,
    amount: number
): void => {
    state.events.effects.floatingPoints.push({
        id: `${Date.now()}:${Math.random()}`,
        x,
        y,
        amount,
        createdAt: Date.now()
    });
    if (state.events.effects.floatingPoints.length > 24) {
        state.events.effects.floatingPoints.shift();
    }
};

const resolvePlayerPosition = (state: ClientState, playerId: string): { x: number; y: number } | null => {
    if (playerId === state.local.id) {
        return { x: state.local.x, y: state.local.y };
    }
    const remote = state.remotePlayers.get(playerId);
    if (!remote) {
        return null;
    }
    return { x: remote.x, y: remote.y };
};

export const handlers: {
    [K in keyof KnownEventPayloadByType]?: EventHandler<K>;
} = {
    ...auxHandlers,
    "lobby.assignment": (state, payload) => {
        const spawn = resolveCitySpawn(payload.city);
        state.local.id = payload.id;
        state.local.city = payload.city;
        state.ui.showBuildMenu = false;
        state.ui.buildGhostMode = false;
        state.ui.buildDemolishMode = false;
        state.ui.pendingBuildPlacement = null;
        if (spawn) {
            state.local.x = spawn.x;
            state.local.y = spawn.y;
            state.render.previousLocalX = spawn.x;
            state.render.previousLocalY = spawn.y;
            state.render.projectedOffsetX = 0;
            state.render.projectedOffsetY = 0;
            state.render.lastResolvedAt = null;
            state.render.authoritativeSnapshots = [];
        }
        state.lobby.deniedReason = null;
    },
    "lobby.denied": (state, payload) => {
        state.lobby.deniedReason = payload.reason;
    },
    "lobby.snapshot": (state, payload) => {
        state.lobby.assignments = payload.map((entry) => {
            const assignment = {
                city: entry.city,
                recruitCount: entry.recruitCount
            };
            if (typeof entry.mayorId === "string") {
                return {
                    ...assignment,
                    mayorId: entry.mayorId
                };
            }
            return {
                ...assignment
            };
        });
    },
    "lobby.high_scores": (state, payload) => {
        state.lobby.highScores = payload.map((entry) => {
            const highScore = {
                userId: entry.userId,
                name: entry.name,
                points: entry.points,
                rankTitle: entry.rankTitle
            };
            if (typeof entry.orbs === "number") {
                Object.assign(highScore, { orbs: entry.orbs });
            }
            if (typeof entry.assists === "number") {
                Object.assign(highScore, { assists: entry.assists });
            }
            if (typeof entry.updatedAt === "number") {
                Object.assign(highScore, { updatedAt: entry.updatedAt });
            }
            return highScore;
        });
    },
    "lobby.released": (state, payload) => {
        state.lobby.lastReleasedPlayerId = payload.id;
        if (payload.id === state.local.id) {
            state.local.id = null;
            state.ui.showBuildMenu = false;
            state.ui.buildGhostMode = false;
            state.ui.buildDemolishMode = false;
            state.ui.pendingBuildPlacement = null;
        }
    },
    "build.denied": (state, payload) => {
        state.events.lastBuildDeniedReason = payload.reason;
    },
    "building.placed": (state, payload) => {
        state.events.lastBuildDeniedReason = null;
        state.buildings.set(payload.id, {
            id: payload.id,
            ownerId: payload.ownerId,
            cityId: payload.cityId,
            type: payload.type,
            tileX: payload.tileX,
            tileY: payload.tileY,
            health: payload.health,
            maxHealth: payload.maxHealth,
            population: 0
        });
    },
    "building.demolished": (state, payload) => {
        state.events.lastDemolishDeniedReason = null;
        const building = state.buildings.get(payload.id);
        if (building) {
            pushExplosion(
                state,
                (building.tileX * TILE_SIZE) + BUILDING_CENTER_OFFSET,
                (building.tileY * TILE_SIZE) + BUILDING_CENTER_OFFSET,
                "large"
            );
        }
        state.buildings.delete(payload.id);
    },
    "population.update": (state, payload) => {
        const existing = state.buildings.get(payload.id);
        if (payload.removed) {
            if (existing) {
                state.buildings.delete(payload.id);
            }
            return;
        }
        if (!existing) {
            return;
        }
        existing.population = payload.population;
        if (payload.attachedHouseId) {
            existing.attachedHouseId = payload.attachedHouseId;
        } else {
            delete existing.attachedHouseId;
        }
    },
    "players.snapshot": (state, payload) => {
        updateFromSnapshot(state, payload);
    },
    "player.health": (state, payload) => {
        setHealth(state, payload.id, payload.health, payload.maxHealth);
    },
    "player.dead": (state, payload) => {
        state.events.lastPlayerDead = {
            id: payload.id,
            ...(typeof payload.by === "string" ? { by: payload.by } : {})
        };
        setHealth(state, payload.id, 0, resolveMaxHealth(state, payload.id));
        const position = resolvePlayerPosition(state, payload.id);
        if (position) {
            pushExplosion(state, position.x, position.y, "small");
            if (payload.by && payload.by === state.local.id) {
                pushFloatingPoints(state, position.x, position.y, 25);
            }
        }
    },
    "player.removed": (state, payload) => {
        if (payload.id === state.local.id) {
            return;
        }
        state.remotePlayers.delete(payload.id);
    },
    "bullet.fired": (state, payload) => {
        state.bullets.set(payload.id, {
            id: payload.id,
            ownerId: payload.ownerId,
            city: payload.city,
            x: payload.position.x,
            y: payload.position.y,
            direction: payload.direction,
            speed: resolveBulletSpeed(payload.type),
            type: payload.type
        });
    },
    "bullet.resolved": (state, payload) => {
        if (payload.reason === "hit_player" && payload.hitPlayerId) {
            // Classic parity: player bullet hits do not spawn an impact overlay on the tank.
        } else if (payload.reason === "hit_building" && payload.hitBuildingId) {
            const building = state.buildings.get(payload.hitBuildingId);
            if (building) {
                pushExplosion(state, (building.tileX * 48) + 24, (building.tileY * 48) + 24, "small");
            }
        } else if (payload.reason === "hit_hazard" && payload.hitHazardId) {
            const hazard = state.hazards.get(payload.hitHazardId);
            if (hazard) {
                pushExplosion(state, hazard.x, hazard.y, "small");
            }
        }
        state.bullets.delete(payload.id);
    },
    "city.orbed": (state, payload) => {
        state.events.lastOrbedCityId = payload.targetCityId;
        state.events.lastOrbEvent = {
            sourceCityId: payload.sourceCityId,
            targetCityId: payload.targetCityId,
            by: payload.by,
            awardedScore: payload.awardedScore,
            at: Date.now()
        };
        pushExplosion(state, state.local.x, state.local.y, "large");
        if (payload.by === state.local.id) {
            pushFloatingPoints(state, state.local.x, state.local.y, payload.awardedScore);
        }
    },
};

export const APPLIED_SERVER_EVENT_TYPES = Object.freeze(
    Object.keys(handlers) as Array<keyof KnownEventPayloadByType>
);

export const hasServerEventHandler = (type: keyof KnownEventPayloadByType): boolean => {
    return type in handlers;
};

export const applyServerEvent = (state: ClientState, event: KnownTypedEventEnvelope): void => {
    const handler = handlers[event.type];
    if (handler) {
        handler(state, event.payload as never);
    }
};

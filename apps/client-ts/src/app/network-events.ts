import type {
    KnownEventPayloadByType,
    KnownTypedEventEnvelope
} from "@battlecity/protocol";
import type { ClientState } from "./state.js";
import { updateFromSnapshot } from "./state.js";

type EventHandler<TType extends keyof KnownEventPayloadByType> =
    (state: ClientState, payload: KnownEventPayloadByType[TType]) => void;

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

const handlers: {
    [K in keyof KnownEventPayloadByType]?: EventHandler<K>;
} = {
    "lobby.assignment": (state, payload) => {
        state.local.id = payload.id;
        state.local.city = payload.city;
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
    "lobby.released": (state, payload) => {
        state.lobby.lastReleasedPlayerId = payload.id;
    },
    "build.denied": (state, payload) => {
        state.events.lastBuildDeniedReason = payload.reason;
    },
    "building.placed": (state, payload) => {
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
        setHealth(state, payload.id, 0, resolveMaxHealth(state, payload.id));
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
            type: payload.type
        });
    },
    "bullet.resolved": (state, payload) => {
        state.bullets.delete(payload.id);
    },
    "chat.history": (state, payload) => {
        state.chat.history = [...payload];
    },
    "chat.message": (state, payload) => {
        state.chat.history.push(payload);
        if (state.chat.history.length > 100) {
            state.chat.history.shift();
        }
    },
    "chat.rate_limit": (state, payload) => {
        state.chat.rateLimitedUntil = payload.retryAt;
    },
    "city.finance": (state, payload) => {
        state.cityFinance.set(payload.cityId, {
            cash: payload.cash,
            income: payload.income,
            score: payload.score,
            researchLevel: payload.researchLevel
        });
    },
    "research.update": (state, payload) => {
        if (payload.active) {
            state.research.set(payload.cityId, {
                active: payload.active,
                completed: [...payload.completed]
            });
            return;
        }
        state.research.set(payload.cityId, {
            completed: [...payload.completed]
        });
    },
    "factory.stock": (state, payload) => {
        const city = state.factoryStock.get(payload.cityId) ?? new Map<number, number>();
        city.set(payload.itemType, payload.stock);
        state.factoryStock.set(payload.cityId, city);
    },
    "inventory.update": (state, payload) => {
        if (payload.playerId !== state.local.id) {
            return;
        }
        state.inventory.clear();
        for (const item of payload.items) {
            state.inventory.set(item.itemType, item.count);
        }
    },
    "icon.pickup.confirmed": (state, payload) => {
        if (payload.playerId !== state.local.id) {
            return;
        }
        state.events.lastIconPickupConfirmed = {
            playerId: payload.playerId,
            cityId: payload.cityId,
            itemType: payload.itemType,
            amount: payload.amount
        };
    },
    "hazard.spawn": (state, payload) => {
        state.hazards.set(payload.id, {
            id: payload.id,
            cityId: payload.cityId,
            type: payload.type,
            x: payload.position.x,
            y: payload.position.y,
            radius: payload.radius
        });
    },
    "hazard.remove": (state, payload) => {
        state.hazards.delete(payload.id);
    },
    "city.orbed": (state, payload) => {
        state.events.lastOrbedCityId = payload.targetCityId;
    },
    "score.promotion": (state, payload) => {
        state.events.promotions.push(payload);
    },
    "score.profile": (state, payload) => {
        if (payload.playerId !== state.local.id) {
            return;
        }
        state.scoreProfile.userId = payload.userId;
        state.scoreProfile.score = payload.score;
        state.scoreProfile.rank = payload.rank;
    },
    "defense.spawn": (state, payload) => {
        state.defenses.set(payload.id, {
            id: payload.id,
            cityId: payload.cityId,
            type: payload.type,
            tileX: payload.tileX,
            tileY: payload.tileY,
            health: payload.health,
            maxHealth: payload.maxHealth
        });
    },
    "defense.update": (state, payload) => {
        const existing = state.defenses.get(payload.id);
        if (!existing) {
            return;
        }
        existing.health = payload.health;
        existing.maxHealth = payload.maxHealth;
    },
    "defense.remove": (state, payload) => {
        state.defenses.delete(payload.id);
    },
    "demolish.denied": (state, payload) => {
        state.events.lastDemolishDeniedReason = payload.reason;
    },
    "event.rejected": (state, payload) => {
        state.events.rejectionCount += 1;
        state.events.lastRejectedReason = payload.reason;
    }
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

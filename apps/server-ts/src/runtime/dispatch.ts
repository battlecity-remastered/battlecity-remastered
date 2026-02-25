import type { KnownEventPayloadByType, KnownTypedEventEnvelope } from "@battlecity/protocol";
import { Effect } from "effect";
import { buildPlayersSnapshot, emitPlayersSnapshot } from "./snapshot.js";
import type { Broadcaster, RuntimeEmitter } from "./emitter.js";
import type { RuntimeConfig, RuntimeRejectReason, RuntimeState } from "./types.js";
import { upsertPlayerFromUpdate } from "./player-runtime.js";
import { createBulletFromRequest } from "./bullet-runtime.js";
import { demolishBuildingFromRequest, placeBuildingFromRequest } from "./building-runtime.js";
import { buildLobbySnapshot, joinLobby, leaveLobby } from "../domain/lobby/LobbyService.js";
import { validatePlayerUpdate } from "../domain/security/PlayerUpdateValidator.js";
import { buildCityFinancePayload, emitCityFinance, getOrCreateCity } from "../domain/economy/CityEconomyService.js";
import { emitResearchState, startResearch } from "../domain/research/ResearchService.js";
import { collectFactoryStock } from "../domain/factories/FactoryService.js";
import { deployHazard } from "../domain/hazards/HazardService.js";
import { dropOrb } from "../domain/orb/OrbService.js";
import { addChatMessage, getChatHistoryForSocket } from "../domain/chat/ChatService.js";
import { addInventoryItem, emitInventoryState } from "../domain/inventory/InventoryService.js";
import { useItem } from "../domain/items/ItemUseService.js";
import { pickupIcon } from "../domain/icons/IconDropService.js";
import { rejectSocket } from "./rejections.js";
import { emitScopedChatMessage, handleCommandResult } from "./dispatch-support.js";
import type { UserStoreAdapter } from "../adapters/persistence/UserStoreAdapter.js";
import { bindSocketIdentity, resolveSocketUserId } from "../domain/identity/IdentityService.js";
import { awardOrbProfileScore, lobbyHighScores, profileForSocket } from "../domain/score/ScoreService.js";
import { deployDefense } from "../domain/defense/DefenseService.js";
import { markFakeCityCooldown } from "../domain/fake-cities/FakeCityService.js";
import { handlePlayerBotDamage } from "./dispatch-combat.js";
import { logRuntime } from "../observability/RuntimeLogger.js";

type DispatchContext = { state: RuntimeState; config: RuntimeConfig; emitter: RuntimeEmitter; broadcaster: Broadcaster; nextSeq: () => number; userStore?: UserStoreAdapter; notifyOrbVictory?: (playerId: string, sourceCityId: number, targetCityId: number) => Effect.Effect<void> };
type RuntimeHandler<TType extends keyof KnownEventPayloadByType> = (socketId: string, payload: KnownEventPayloadByType[TType], context: DispatchContext) => void;
type HandlerMap = { [K in keyof KnownEventPayloadByType]?: RuntimeHandler<K> };

const emitLobbyHighScoreSnapshot = (
    context: DispatchContext,
    targetSocketId?: string
): void => {
    if (!context.userStore) {
        return;
    }
    const payload = Effect.runSync(lobbyHighScores(context.userStore));
    if (targetSocketId) {
        context.emitter.emitTo(targetSocketId, "lobby.high_scores", payload);
        return;
    }
    context.emitter.emit("lobby.high_scores", payload);
};

const rejectWithContext = (
    context: DispatchContext,
    socketId: string,
    reason: RuntimeRejectReason,
    eventType: keyof KnownEventPayloadByType,
    payload: unknown
): void => {
    rejectSocket(context.broadcaster, socketId, reason, {
        eventType,
        payload
    });
};

const emitJoinWorldHydration = (context: DispatchContext, socketId: string): void => {
    const { state, config, emitter } = context;
    const cityIds = new Set<number>();
    for (let cityId = 0; cityId < config.cityCount; cityId += 1) {
        cityIds.add(cityId);
    }
    for (const cityId of state.cities.keys()) {
        cityIds.add(cityId);
    }
    const sortedCityIds = [...cityIds].sort((left, right) => left - right);

    // Hydrate full world entities so late-join clients can render the same authoritative state.
    for (const bullet of state.bullets.values()) {
        emitter.emitTo(socketId, "bullet.fired", {
            id: bullet.id,
            ownerId: bullet.ownerId,
            city: bullet.city,
            position: {
                x: bullet.x,
                y: bullet.y
            },
            direction: bullet.direction,
            type: bullet.type
        });
    }

    for (const building of state.buildings.values()) {
        emitter.emitTo(socketId, "building.placed", {
            id: building.id,
            ownerId: building.ownerId,
            cityId: building.cityId,
            type: building.type,
            tileX: building.tileX,
            tileY: building.tileY,
            health: building.health,
            maxHealth: building.maxHealth
        });
        emitter.emitTo(socketId, "population.update", {
            id: building.id,
            cityId: building.cityId,
            type: building.type,
            tileX: building.tileX,
            tileY: building.tileY,
            population: building.population,
            attachedHouseId: building.attachedHouseId,
            removed: false
        });
    }

    for (const hazard of state.hazards.values()) {
        emitter.emitTo(socketId, "hazard.spawn", {
            id: hazard.id,
            cityId: hazard.cityId,
            type: hazard.type,
            position: {
                x: hazard.x,
                y: hazard.y
            },
            radius: hazard.radius,
            armed: hazard.armed,
            active: hazard.active
        });
    }

    for (const defense of state.defenses.values()) {
        const basePayload = {
            id: defense.id,
            cityId: defense.cityId,
            type: defense.type,
            tileX: defense.tileX,
            tileY: defense.tileY,
            health: defense.health,
            maxHealth: defense.maxHealth
        };
        const defensePayload: KnownEventPayloadByType["defense.spawn"] =
            typeof defense.orientation === "number" && Number.isFinite(defense.orientation)
                ? { ...basePayload, orientation: defense.orientation }
                : basePayload;
        emitter.emitTo(socketId, "defense.spawn", defensePayload);
    }

    for (const cityId of sortedCityIds) {
        getOrCreateCity(state, cityId, config);
        emitter.emitTo(socketId, "city.finance", buildCityFinancePayload(state, cityId, config));
        const research = state.research.get(cityId);
        emitter.emitTo(socketId, "research.update", {
            cityId,
            active: research?.active
                ? {
                    researchType: research.active.researchType,
                    remainingMs: research.active.remainingMs
                }
                : undefined,
            completed: [...(research?.completed ?? [])]
        });
        const stock = state.factoryStock.get(cityId);
        if (!stock) {
            continue;
        }
        for (const [itemType, itemStock] of stock.entries()) {
            emitter.emitTo(socketId, "factory.stock", {
                cityId,
                itemType,
                stock: itemStock
            });
        }
    }

    emitter.emitTo(socketId, "players.snapshot", buildPlayersSnapshot(state));
};

const handlers: HandlerMap = {
    "lobby.join.request": (socketId, payload, context) => {
        const userId = bindSocketIdentity(context.state, socketId, payload);
        handleCommandResult(socketId, context.emitter, context.broadcaster, joinLobby(
            context.state,
            socketId,
            payload.desiredCity,
            context.config
        ), (assignment) => {
            if (context.userStore) {
                Effect.runSync(context.userStore.getOrCreate(userId, payload.callsign));
            }
            context.emitter.emitTo(socketId, "lobby.assignment", assignment);
            context.emitter.emit("lobby.snapshot", buildLobbySnapshot(context.state, context.config));
            emitLobbyHighScoreSnapshot(context);
            context.emitter.emitTo(socketId, "chat.history", getChatHistoryForSocket(context.state, socketId));
            context.emitter.emitTo(socketId, "inventory.update", emitInventoryState(context.state, socketId));
            getOrCreateCity(context.state, assignment.city, context.config);
            emitJoinWorldHydration(context, socketId);
            emitCityFinance(context.state, assignment.city, context.config, context.emitter);
            emitResearchState(context.state, assignment.city, context.emitter);
            emitPlayersSnapshot(context.state, context.emitter);
            if (context.userStore) {
                const profile = Effect.runSync(profileForSocket(context.userStore, socketId, userId));
                context.emitter.emitTo(socketId, "score.profile", profile);
            }
        }, {
            eventType: "lobby.join.request",
            payload
        });
    },
    "lobby.leave.request": (socketId, _payload, context) => {
        const released = leaveLobby(context.state, socketId);
        if (released) {
            context.emitter.emit("lobby.released", released);
            context.emitter.emit("lobby.snapshot", buildLobbySnapshot(context.state, context.config));
            emitLobbyHighScoreSnapshot(context);
        }
    },
    "player.update": (socketId, payload, context) => {
        const assignedCity = context.state.socketCities.get(socketId);
        if (assignedCity === undefined) {
            rejectWithContext(context, socketId, "player_not_joined", "player.update", payload);
            return;
        }
        const validation = validatePlayerUpdate(
            context.state.players.get(socketId),
            payload,
            context.config
        );
        if (!validation.ok) {
            rejectWithContext(context, socketId, validation.reason, "player.update", payload);
            return;
        }
        upsertPlayerFromUpdate(context.state, socketId, assignedCity, payload, context.config);
        emitPlayersSnapshot(context.state, context.emitter);
    },
    "player.bot_damage": (socketId, payload, context) => {
        handlePlayerBotDamage(socketId, payload, context);
    },
    "bullet.fire.request": (socketId, payload, context) => {
        handleCommandResult(
            socketId,
            context.emitter,
            context.broadcaster,
            createBulletFromRequest(
                context.state,
                socketId,
                payload,
                context.config,
                context.nextSeq
            ),
            (bullet) => {
                context.emitter.emit("bullet.fired", {
                    id: bullet.id,
                    ownerId: bullet.ownerId,
                    city: bullet.city,
                    position: {
                        x: bullet.x,
                        y: bullet.y
                    },
                    direction: bullet.direction,
                    type: bullet.type
                });
            },
            {
                eventType: "bullet.fire.request",
                payload
            }
        );
    },
    "building.place.request": (socketId, payload, context) => {
        Effect.runSync(logRuntime("debug", "build.request", {
            socketId,
            payload,
            assignedCity: context.state.socketCities.get(socketId),
            role: context.state.socketRoles.get(socketId)
        }));
        const result = placeBuildingFromRequest(
            context.state,
            socketId,
            payload,
            context.config,
            context.nextSeq
        );
        if (!result.ok) {
            context.emitter.emitTo(socketId, "build.denied", {
                reason: result.reason,
                cityId: payload.cityId,
                type: payload.type,
                tileX: payload.tileX,
                tileY: payload.tileY
            });
            Effect.runSync(logRuntime("debug", "build.denied", {
                socketId,
                reason: result.reason,
                payload,
                assignedCity: context.state.socketCities.get(socketId),
                role: context.state.socketRoles.get(socketId)
            }));
            rejectWithContext(context, socketId, result.reason, "building.place.request", payload);
            return;
        }
        Effect.runSync(logRuntime("debug", "build.accepted", {
            socketId,
            building: result.value.building
        }));
        context.emitter.emit("building.placed", result.value.building);
        for (const update of result.value.populationUpdates) {
            context.emitter.emit("population.update", update);
        }
        emitCityFinance(context.state, payload.cityId, context.config, context.emitter);
    },
    "building.demolish.request": (socketId, payload, context) => {
        const result = demolishBuildingFromRequest(context.state, socketId, payload);
        if (!result.ok) {
            context.emitter.emitTo(socketId, "demolish.denied", {
                id: payload.id,
                reason: result.reason
            });
            rejectWithContext(context, socketId, result.reason, "building.demolish.request", payload);
            return;
        }
        context.emitter.emit("building.demolished", {
            id: result.value.building.id,
            cityId: result.value.building.cityId
        });
        for (const update of result.value.populationUpdates) {
            context.emitter.emit("population.update", update);
        }
        emitCityFinance(context.state, payload.cityId, context.config, context.emitter);
    },
    "chat.message.request": (socketId, payload, context) => {
        const result = addChatMessage(context.state, socketId, payload, context.config);
        if (!result.ok) {
            if (result.reason === "chat_rate_limited") {
                context.emitter.emitTo(socketId, "chat.rate_limit", {
                    scope: payload.scope ?? "team",
                    retryAt: Date.now() + 1000
                });
            }
            rejectWithContext(context, socketId, result.reason, "chat.message.request", payload);
            return;
        }
        if (result.value.message) {
            emitScopedChatMessage(context.state, context.emitter, result.value.message);
        }
    },
    "research.start.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined || city !== payload.cityId) {
            rejectWithContext(context, socketId, "city_mismatch", "research.start.request", payload);
            return;
        }
        handleCommandResult(socketId, context.emitter, context.broadcaster, startResearch(
            context.state,
            payload.cityId,
            payload.researchType,
            context.config
        ), (research) => {
            context.emitter.emit("research.update", research);
            emitCityFinance(context.state, payload.cityId, context.config, context.emitter);
        }, {
            eventType: "research.start.request",
            payload
        });
    },
    "factory.collect.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined || city !== payload.cityId) {
            rejectWithContext(context, socketId, "city_mismatch", "factory.collect.request", payload);
            return;
        }
        handleCommandResult(socketId, context.emitter, context.broadcaster, collectFactoryStock(
            context.state,
            payload.cityId,
            payload.itemType,
            payload.amount ?? 1
        ), (stock) => {
            context.emitter.emit("factory.stock", stock);
            context.emitter.emitTo(socketId, "inventory.update", addInventoryItem(
                context.state,
                socketId,
                payload.itemType,
                payload.amount ?? 1,
                context.config
            ));
        }, {
            eventType: "factory.collect.request",
            payload
        });
    },
    "icon.pickup.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined || city !== payload.cityId) {
            rejectWithContext(context, socketId, "city_mismatch", "icon.pickup.request", payload);
            return;
        }
        handleCommandResult(socketId, context.emitter, context.broadcaster, pickupIcon(
            context.state,
            socketId,
            payload,
            context.config
        ), ({ stock, inventory, confirmed, removedHazardId }) => {
            context.emitter.emit("factory.stock", stock);
            context.emitter.emitTo(socketId, "inventory.update", inventory);
            context.emitter.emitTo(socketId, "icon.pickup.confirmed", confirmed);
            if (removedHazardId) {
                context.emitter.emit("hazard.remove", {
                    id: removedHazardId,
                    reason: "cleared"
                });
            }
        }, {
            eventType: "icon.pickup.request",
            payload
        });
    },
    "item.use.request": (socketId, payload, context) => {
        handleCommandResult(socketId, context.emitter, context.broadcaster, useItem(context.state, socketId, payload), (result) => {
            context.emitter.emit("player.health", result.health);
            context.emitter.emitTo(socketId, "inventory.update", result.inventory);
        }, {
            eventType: "item.use.request",
            payload
        });
    },
    "hazard.deploy.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined) {
            rejectWithContext(context, socketId, "player_not_joined", "hazard.deploy.request", payload);
            return;
        }
        handleCommandResult(socketId, context.emitter, context.broadcaster, deployHazard(
            context.state,
            socketId,
            city,
            payload,
            context.nextSeq,
            context.config
        ), (result) => {
            context.emitter.emit("hazard.spawn", result.hazard);
            if (result.inventory) {
                context.emitter.emitTo(socketId, "inventory.update", result.inventory);
            }
        }, {
            eventType: "hazard.deploy.request",
            payload
        });
    },
    "orb.drop.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined) {
            rejectWithContext(context, socketId, "player_not_joined", "orb.drop.request", payload);
            return;
        }
        if (city !== payload.sourceCityId) {
            rejectWithContext(context, socketId, "city_mismatch", "orb.drop.request", payload);
            return;
        }
        handleCommandResult(socketId, context.emitter, context.broadcaster, dropOrb(
            context.state,
            socketId,
            payload,
            context.config
        ), ({ cityOrbed, scorePromotion, removedBuildingIds, removedHazardIds, removedDefenseIds, inventory }) => {
            context.emitter.emit("city.orbed", cityOrbed);
            context.emitter.emit("score.promotion", scorePromotion);
            context.emitter.emitTo(socketId, "inventory.update", inventory);
            markFakeCityCooldown(context.state, cityOrbed.targetCityId, Date.now(), context.config);
            emitPlayersSnapshot(context.state, context.emitter);
            emitCityFinance(context.state, cityOrbed.sourceCityId, context.config, context.emitter);
            emitCityFinance(context.state, cityOrbed.targetCityId, context.config, context.emitter);
            for (const buildingId of removedBuildingIds) {
                context.emitter.emit("building.demolished", {
                    id: buildingId,
                    cityId: cityOrbed.targetCityId
                });
            }
            for (const hazardId of removedHazardIds) {
                context.emitter.emit("hazard.remove", {
                    id: hazardId,
                    reason: "city_orbed"
                });
            }
            for (const defenseId of removedDefenseIds) {
                context.emitter.emit("defense.remove", {
                    id: defenseId,
                    reason: "city_orbed"
                });
            }
            if (context.userStore) {
                const userId = resolveSocketUserId(context.state, socketId);
                const profile = Effect.runSync(awardOrbProfileScore(
                    context.userStore,
                    socketId,
                    userId,
                    context.config.orbScoreAward
                ));
                context.emitter.emitTo(socketId, "score.profile", profile);
                emitLobbyHighScoreSnapshot(context);
            }
            if (context.notifyOrbVictory) {
                const userId = resolveSocketUserId(context.state, socketId);
                Effect.runFork(context.notifyOrbVictory(userId, cityOrbed.sourceCityId, cityOrbed.targetCityId));
            }
        }, {
            eventType: "orb.drop.request",
            payload
        });
    },
    "defense.deploy.request": (socketId, payload, context) => {
        handleCommandResult(socketId, context.emitter, context.broadcaster, deployDefense(
            context.state,
            socketId,
            payload,
            context.config,
            context.nextSeq
        ), (result) => {
            context.emitter.emit("defense.spawn", result.spawn);
            if (result.inventory) {
                context.emitter.emitTo(socketId, "inventory.update", result.inventory);
            }
            if (result.spentCash) {
                emitCityFinance(context.state, payload.cityId, context.config, context.emitter);
            }
        }, {
            eventType: "defense.deploy.request",
            payload
        });
    }
};

export const HANDLED_RUNTIME_EVENT_TYPES = Object.freeze(Object.keys(handlers) as Array<keyof KnownEventPayloadByType>);
export const hasRuntimeEventHandler = (type: keyof KnownEventPayloadByType): boolean => type in handlers;

const dispatchByType = <TType extends keyof KnownEventPayloadByType>(socketId: string, type: TType, payload: KnownEventPayloadByType[TType], context: DispatchContext): void => {
    const handler = handlers[type] as RuntimeHandler<TType> | undefined;
    if (!handler) {
        return;
    }
    handler(socketId, payload, context);
};
export const dispatchRuntimeEvent = (socketId: string, event: KnownTypedEventEnvelope, context: DispatchContext): void => {
    dispatchByType(socketId, event.type, event.payload as KnownEventPayloadByType[typeof event.type], context);
};

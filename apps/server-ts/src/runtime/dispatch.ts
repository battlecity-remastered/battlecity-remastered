import type { KnownEventPayloadByType, KnownTypedEventEnvelope } from "@battlecity/protocol";
import { emitPlayersSnapshot } from "./snapshot.js";
import type { RuntimeEmitter } from "./emitter.js";
import type { Broadcaster } from "./emitter.js";
import type { CommandResult, RuntimeConfig, RuntimeState } from "./types.js";
import { upsertPlayerFromUpdate } from "./player-runtime.js";
import { createBulletFromRequest } from "./bullet-runtime.js";
import { demolishBuildingFromRequest, placeBuildingFromRequest } from "./building-runtime.js";
import { buildLobbySnapshot, joinLobby, leaveLobby } from "../domain/lobby/LobbyService.js";
import { validatePlayerUpdate } from "../domain/security/PlayerUpdateValidator.js";
import { emitCityFinance, getOrCreateCity } from "../domain/economy/CityEconomyService.js";
import { emitResearchState, startResearch } from "../domain/research/ResearchService.js";
import { collectFactoryStock } from "../domain/factories/FactoryService.js";
import { deployHazard } from "../domain/hazards/HazardService.js";
import { dropOrb } from "../domain/orb/OrbService.js";
import { addChatMessage, getChatHistory } from "../domain/chat/ChatService.js";
import { addInventoryItem, emitInventoryState } from "../domain/inventory/InventoryService.js";
import { useItem } from "../domain/items/ItemUseService.js";
import { pickupIcon } from "../domain/icons/IconDropService.js";
import { rejectSocket } from "./rejections.js";

type DispatchContext = {
    state: RuntimeState;
    config: RuntimeConfig;
    emitter: RuntimeEmitter;
    broadcaster: Broadcaster;
    nextSeq: () => number;
};

type RuntimeHandler<TType extends keyof KnownEventPayloadByType> = (
    socketId: string,
    payload: KnownEventPayloadByType[TType],
    context: DispatchContext
) => void;

type HandlerMap = {
    [K in keyof KnownEventPayloadByType]?: RuntimeHandler<K>;
};

const handleCommandResult = <T>(
    socketId: string,
    context: DispatchContext,
    result: CommandResult<T>,
    onOk: (value: T) => void
): void => {
    if (!result.ok) {
        if (result.reason === "lobby_full") {
            context.emitter.emitTo(socketId, "lobby.denied", {
                reason: result.reason
            });
        }
        rejectSocket(context.broadcaster, socketId, result.reason);
        return;
    }
    onOk(result.value);
};

const handlers: HandlerMap = {
    "lobby.join.request": (socketId, payload, context) => {
        handleCommandResult(socketId, context, joinLobby(
            context.state,
            socketId,
            payload.desiredCity,
            context.config
        ), (assignment) => {
            context.emitter.emitTo(socketId, "lobby.assignment", assignment);
            context.emitter.emit("lobby.snapshot", buildLobbySnapshot(context.state, context.config));
            context.emitter.emitTo(socketId, "chat.history", getChatHistory(context.state));
            context.emitter.emitTo(socketId, "inventory.update", emitInventoryState(context.state, socketId));
            getOrCreateCity(context.state, assignment.city, context.config);
            emitCityFinance(context.state, assignment.city, context.config, context.emitter);
            emitResearchState(context.state, assignment.city, context.emitter);
            emitPlayersSnapshot(context.state, context.emitter);
        });
    },
    "lobby.leave.request": (socketId, _payload, context) => {
        const released = leaveLobby(context.state, socketId);
        if (released) {
            context.emitter.emit("lobby.released", released);
            context.emitter.emit("lobby.snapshot", buildLobbySnapshot(context.state, context.config));
        }
    },
    "player.update": (socketId, payload, context) => {
        const validation = validatePlayerUpdate(
            context.state.players.get(socketId),
            payload,
            context.config
        );
        if (!validation.ok) {
            rejectSocket(context.broadcaster, socketId, validation.reason);
            return;
        }
        upsertPlayerFromUpdate(context.state, socketId, payload, context.config);
        emitPlayersSnapshot(context.state, context.emitter);
    },
    "bullet.fire.request": (socketId, payload, context) => {
        handleCommandResult(
            socketId,
            context,
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
            }
        );
    },
    "building.place.request": (socketId, payload, context) => {
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
            rejectSocket(context.broadcaster, socketId, result.reason);
            return;
        }

        context.emitter.emit("building.placed", result.value);
    },
    "building.demolish.request": (socketId, payload, context) => {
        const result = demolishBuildingFromRequest(context.state, socketId, payload);
        if (!result.ok) {
            context.emitter.emitTo(socketId, "demolish.denied", {
                id: payload.id,
                reason: result.reason
            });
            rejectSocket(context.broadcaster, socketId, result.reason);
            return;
        }

        context.emitter.emit("building.demolished", {
            id: result.value.id,
            cityId: result.value.cityId
        });
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
            rejectSocket(context.broadcaster, socketId, result.reason);
            return;
        }
        if (result.value.message) {
            context.emitter.emit("chat.message", result.value.message);
        }
    },
    "research.start.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined || city !== payload.cityId) {
            rejectSocket(context.broadcaster, socketId, "city_mismatch");
            return;
        }
        handleCommandResult(socketId, context, startResearch(
            context.state,
            payload.cityId,
            payload.researchType,
            context.config
        ), (research) => {
            context.emitter.emit("research.update", research);
            emitCityFinance(context.state, payload.cityId, context.config, context.emitter);
        });
    },
    "factory.collect.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined || city !== payload.cityId) {
            rejectSocket(context.broadcaster, socketId, "city_mismatch");
            return;
        }
        handleCommandResult(socketId, context, collectFactoryStock(
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
        });
    },
    "icon.pickup.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined || city !== payload.cityId) {
            rejectSocket(context.broadcaster, socketId, "city_mismatch");
            return;
        }
        handleCommandResult(socketId, context, pickupIcon(
            context.state,
            socketId,
            payload,
            context.config
        ), ({ stock, inventory, confirmed }) => {
            context.emitter.emit("factory.stock", stock);
            context.emitter.emitTo(socketId, "inventory.update", inventory);
            context.emitter.emitTo(socketId, "icon.pickup.confirmed", confirmed);
        });
    },
    "item.use.request": (socketId, payload, context) => {
        handleCommandResult(socketId, context, useItem(context.state, socketId, payload), (result) => {
            context.emitter.emit("player.health", result.health);
            context.emitter.emitTo(socketId, "inventory.update", result.inventory);
        });
    },
    "hazard.deploy.request": (socketId, payload, context) => {
        const city = context.state.socketCities.get(socketId);
        if (city === undefined) {
            rejectSocket(context.broadcaster, socketId, "player_not_joined");
            return;
        }
        handleCommandResult(socketId, context, deployHazard(
            context.state,
            city,
            payload,
            context.nextSeq,
            context.config
        ), (hazard) => {
            context.emitter.emit("hazard.spawn", hazard);
        });
    },
    "orb.drop.request": (socketId, payload, context) => {
        handleCommandResult(socketId, context, dropOrb(
            context.state,
            socketId,
            payload,
            context.config
        ), ({ cityOrbed, scorePromotion }) => {
            context.emitter.emit("city.orbed", cityOrbed);
            context.emitter.emit("score.promotion", scorePromotion);
            emitCityFinance(context.state, payload.sourceCityId, context.config, context.emitter);
            emitCityFinance(context.state, payload.targetCityId, context.config, context.emitter);
        });
    }
};

const dispatchByType = <TType extends keyof KnownEventPayloadByType>(
    socketId: string,
    type: TType,
    payload: KnownEventPayloadByType[TType],
    context: DispatchContext
): void => {
    const handler = handlers[type] as RuntimeHandler<TType> | undefined;
    if (!handler) {
        return;
    }
    handler(socketId, payload, context);
};

export const dispatchRuntimeEvent = (
    socketId: string,
    event: KnownTypedEventEnvelope,
    context: DispatchContext
): void => {
    dispatchByType(
        socketId,
        event.type,
        event.payload as KnownEventPayloadByType[typeof event.type],
        context
    );
};

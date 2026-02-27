import { Schema } from "@effect/schema";
import * as Events from "./events-schemas.js";

export * from "./events-schemas.js";

export const EventPayloadSchemas = {
    "lobby.join.request": Events.LobbyJoinRequest,
    "lobby.leave.request": Events.LobbyLeaveRequest,
    "lobby.denied": Events.LobbyDenied,
    "lobby.released": Events.LobbyReleased,
    "lobby.snapshot": Events.LobbySnapshot,
    "lobby.high_scores": Events.LobbyHighScores,
    "player.update": Events.PlayerUpdate,
    "player.health": Events.PlayerHealthUpdate,
    "player.bot_damage": Events.PlayerBotDamage,
    "player.dead": Events.PlayerDead,
    "player.removed": Events.PlayerRemoved,
    "players.snapshot": Events.PlayersSnapshot,
    "bullet.fire.request": Events.BulletFireRequest,
    "bullet.fired": Events.BulletFired,
    "bullet.resolved": Events.BulletResolved,
    "building.place.request": Events.BuildingPlaceRequest,
    "build.denied": Events.BuildDenied,
    "building.placed": Events.BuildingPlaced,
    "building.demolish.request": Events.BuildingDemolishRequest,
    "demolish.denied": Events.DemolishDenied,
    "event.rejected": Events.EventRejected,
    "building.demolished": Events.BuildingDemolished,
    "population.update": Events.PopulationUpdate,
    "lobby.assignment": Events.LobbyAssignment,
    "chat.message": Events.ChatMessage,
    "chat.message.request": Events.ChatMessageRequest,
    "chat.history": Events.ChatHistory,
    "chat.rate_limit": Events.ChatRateLimit,
    "city.finance": Events.CityFinance,
    "research.start.request": Events.ResearchStartRequest,
    "research.update": Events.ResearchUpdate,
    "factory.collect.request": Events.FactoryCollectRequest,
    "factory.stock": Events.FactoryStock,
    "icon.pickup.request": Events.IconPickupRequest,
    "icon.pickup.confirmed": Events.IconPickupConfirmed,
    "inventory.update": Events.InventoryUpdate,
    "item.use.request": Events.ItemUseRequest,
    "hazard.deploy.request": Events.HazardDeployRequest,
    "hazard.spawn": Events.HazardSpawn,
    "hazard.remove": Events.HazardRemove,
    "orb.drop.request": Events.OrbDropRequest,
    "city.orbed": Events.CityOrbed,
    "score.promotion": Events.ScorePromotion,
    "score.profile": Events.ScoreProfile,
    "defense.deploy.request": Events.DefenseDeployRequest,
    "defense.spawn": Events.DefenseSpawn,
    "defense.update": Events.DefenseUpdate,
    "defense.remove": Events.DefenseRemove
} as const;

export type KnownEventPayloadByType = { [K in keyof typeof EventPayloadSchemas]: Schema.Schema.Type<(typeof EventPayloadSchemas)[K]> };
export type EventPayloadByType = KnownEventPayloadByType & Record<string, unknown>;

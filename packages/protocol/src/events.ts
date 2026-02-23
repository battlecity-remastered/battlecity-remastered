import { Schema } from "@effect/schema";

export const Vec2 = Schema.Struct({
    x: Schema.Number,
    y: Schema.Number
});

export const LobbyJoinRequest = Schema.Struct({
    desiredCity: Schema.optional(Schema.Number),
    callsign: Schema.optional(Schema.String)
});

export const LobbyLeaveRequest = Schema.Struct({});

export const LobbyAssignment = Schema.Struct({
    id: Schema.String,
    city: Schema.Number,
    role: Schema.Literal("mayor", "recruit")
});

export const LobbyDenied = Schema.Struct({
    reason: Schema.String
});

export const LobbyReleased = Schema.Struct({
    id: Schema.String,
    city: Schema.Number
});

export const LobbySnapshotEntry = Schema.Struct({
    city: Schema.Number,
    mayorId: Schema.optional(Schema.String),
    recruitCount: Schema.Number
});

export const LobbySnapshot = Schema.Array(LobbySnapshotEntry);

export const PlayerUpdate = Schema.Struct({
    id: Schema.String,
    city: Schema.Number,
    direction: Schema.Number,
    isMoving: Schema.Boolean,
    offset: Vec2
});

export const PlayersSnapshotEntry = Schema.Struct({
    id: Schema.String,
    city: Schema.Number,
    direction: Schema.Number,
    offset: Vec2,
    health: Schema.optional(Schema.Number),
    maxHealth: Schema.optional(Schema.Number)
});

export const PlayersSnapshot = Schema.Array(PlayersSnapshotEntry);

export const PlayerHealthUpdate = Schema.Struct({
    id: Schema.String,
    health: Schema.Number,
    maxHealth: Schema.Number,
    source: Schema.optional(Schema.String)
});

export const BulletFireRequest = Schema.Struct({
    ownerId: Schema.String,
    position: Vec2,
    direction: Schema.Number,
    type: Schema.Number
});

export const BulletFired = Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    city: Schema.Number,
    position: Vec2,
    direction: Schema.Number,
    type: Schema.Number
});

export const BulletResolved = Schema.Struct({
    id: Schema.String,
    reason: Schema.Literal("out_of_bounds", "hit_player", "hit_building"),
    hitPlayerId: Schema.optional(Schema.String),
    hitBuildingId: Schema.optional(Schema.String)
});

export const BuildingPlaceRequest = Schema.Struct({
    ownerId: Schema.String,
    cityId: Schema.Number,
    type: Schema.Number,
    tileX: Schema.Number,
    tileY: Schema.Number
});

export const BuildingPlaced = Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    cityId: Schema.Number,
    type: Schema.Number,
    tileX: Schema.Number,
    tileY: Schema.Number,
    health: Schema.Number,
    maxHealth: Schema.Number
});

export const BuildingDemolished = Schema.Struct({
    id: Schema.String,
    cityId: Schema.Number
});

export const PlayerDead = Schema.Struct({
    id: Schema.String,
    by: Schema.optional(Schema.String)
});

export const PlayerRemoved = Schema.Struct({
    id: Schema.String
});

export const BuildingDemolishRequest = Schema.Struct({
    id: Schema.String,
    cityId: Schema.Number,
    ownerId: Schema.optional(Schema.String)
});

export const ChatMessage = Schema.Struct({
    id: Schema.String,
    from: Schema.String,
    city: Schema.Number,
    text: Schema.String,
    ts: Schema.Number,
    scope: Schema.Literal("team", "global")
});

export const ChatMessageRequest = Schema.Struct({
    text: Schema.String,
    scope: Schema.optional(Schema.Literal("team", "global"))
});

export const ChatHistory = Schema.Array(ChatMessage);

export const ChatRateLimit = Schema.Struct({
    scope: Schema.Literal("team", "global"),
    retryAt: Schema.Number
});

export const CityFinance = Schema.Struct({
    cityId: Schema.Number,
    cash: Schema.Number,
    income: Schema.Number,
    score: Schema.Number,
    researchLevel: Schema.Number
});

export const ResearchStartRequest = Schema.Struct({
    cityId: Schema.Number,
    researchType: Schema.Number
});

export const ResearchUpdate = Schema.Struct({
    cityId: Schema.Number,
    active: Schema.optional(Schema.Struct({
        researchType: Schema.Number,
        remainingMs: Schema.Number
    })),
    completed: Schema.Array(Schema.Number)
});

export const FactoryCollectRequest = Schema.Struct({
    cityId: Schema.Number,
    itemType: Schema.Number,
    amount: Schema.optional(Schema.Number)
});

export const FactoryStock = Schema.Struct({
    cityId: Schema.Number,
    itemType: Schema.Number,
    stock: Schema.Number
});

export const HazardDeployRequest = Schema.Struct({
    cityId: Schema.Number,
    type: Schema.Number,
    position: Vec2,
    radius: Schema.optional(Schema.Number),
    damage: Schema.optional(Schema.Number),
    fuseMs: Schema.optional(Schema.Number)
});

export const HazardSpawn = Schema.Struct({
    id: Schema.String,
    cityId: Schema.Number,
    type: Schema.Number,
    position: Vec2,
    radius: Schema.Number
});

export const HazardRemove = Schema.Struct({
    id: Schema.String,
    reason: Schema.Literal("detonated", "expired", "cleared")
});

export const OrbDropRequest = Schema.Struct({
    sourceCityId: Schema.Number,
    targetCityId: Schema.Number
});

export const CityOrbed = Schema.Struct({
    sourceCityId: Schema.Number,
    targetCityId: Schema.Number,
    by: Schema.String,
    awardedScore: Schema.Number
});

export const ScorePromotion = Schema.Struct({
    cityId: Schema.Number,
    score: Schema.Number,
    rank: Schema.String
});

export const EventPayloadSchemas = {
    "lobby.join.request": LobbyJoinRequest,
    "lobby.leave.request": LobbyLeaveRequest,
    "lobby.denied": LobbyDenied,
    "lobby.released": LobbyReleased,
    "lobby.snapshot": LobbySnapshot,
    "player.update": PlayerUpdate,
    "player.health": PlayerHealthUpdate,
    "player.dead": PlayerDead,
    "player.removed": PlayerRemoved,
    "players.snapshot": PlayersSnapshot,
    "bullet.fire.request": BulletFireRequest,
    "bullet.fired": BulletFired,
    "bullet.resolved": BulletResolved,
    "building.place.request": BuildingPlaceRequest,
    "building.placed": BuildingPlaced,
    "building.demolish.request": BuildingDemolishRequest,
    "building.demolished": BuildingDemolished,
    "lobby.assignment": LobbyAssignment,
    "chat.message": ChatMessage,
    "chat.message.request": ChatMessageRequest,
    "chat.history": ChatHistory,
    "chat.rate_limit": ChatRateLimit,
    "city.finance": CityFinance,
    "research.start.request": ResearchStartRequest,
    "research.update": ResearchUpdate,
    "factory.collect.request": FactoryCollectRequest,
    "factory.stock": FactoryStock,
    "hazard.deploy.request": HazardDeployRequest,
    "hazard.spawn": HazardSpawn,
    "hazard.remove": HazardRemove,
    "orb.drop.request": OrbDropRequest,
    "city.orbed": CityOrbed,
    "score.promotion": ScorePromotion
} as const;

export type KnownEventPayloadByType = {
    [K in keyof typeof EventPayloadSchemas]: Schema.Schema.Type<(typeof EventPayloadSchemas)[K]>;
};

export type EventPayloadByType = KnownEventPayloadByType & Record<string, unknown>;

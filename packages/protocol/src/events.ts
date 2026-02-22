import { Schema } from "@effect/schema";

export const Vec2 = Schema.Struct({
    x: Schema.Number,
    y: Schema.Number
});

export const LobbyJoinRequest = Schema.Struct({
    desiredCity: Schema.optional(Schema.Number),
    callsign: Schema.optional(Schema.String)
});

export const LobbyAssignment = Schema.Struct({
    id: Schema.String,
    city: Schema.Number,
    role: Schema.Literal("mayor", "recruit")
});

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
    id: Schema.optional(Schema.String),
    from: Schema.optional(Schema.String),
    city: Schema.optional(Schema.Number),
    text: Schema.optional(Schema.String),
    ts: Schema.optional(Schema.Number)
});

export const EventPayloadSchemas = {
    "lobby.join.request": LobbyJoinRequest,
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
    "chat.message": ChatMessage
} as const;

export type KnownEventPayloadByType = {
    [K in keyof typeof EventPayloadSchemas]: Schema.Schema.Type<(typeof EventPayloadSchemas)[K]>;
};

export type EventPayloadByType = KnownEventPayloadByType & Record<string, unknown>;

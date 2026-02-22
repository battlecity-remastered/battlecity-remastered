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

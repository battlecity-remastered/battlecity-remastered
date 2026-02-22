import { Schema } from "@effect/schema";

export const Vec2 = Schema.Struct({
    x: Schema.Number,
    y: Schema.Number
});

export const PlayerUpdate = Schema.Struct({
    id: Schema.String,
    city: Schema.Number,
    direction: Schema.Number,
    isMoving: Schema.Boolean,
    offset: Vec2
});

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

export const BuildingPlaceRequest = Schema.Struct({
    ownerId: Schema.String,
    cityId: Schema.Number,
    type: Schema.Number,
    tileX: Schema.Number,
    tileY: Schema.Number
});

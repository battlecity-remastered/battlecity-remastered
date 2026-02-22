import { Schema } from "@effect/schema";

export const EventType = Schema.Literal(
    "player.update",
    "player.health",
    "player.dead",
    "player.removed",
    "bullet.fire.request",
    "bullet.fired",
    "building.place.request",
    "building.placed",
    "building.demolish.request",
    "building.demolished",
    "lobby.assignment",
    "chat.message"
);

export const EventEnvelope = Schema.Struct({
    type: EventType,
    version: Schema.String,
    seq: Schema.Number,
    ts: Schema.Number,
    payload: Schema.Unknown
});

export type EventEnvelope = Schema.Schema.Type<typeof EventEnvelope>;

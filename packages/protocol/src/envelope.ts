import { Schema } from "@effect/schema";

export const EventType = Schema.Literal(
    "lobby.join.request",
    "player.update",
    "player.health",
    "player.dead",
    "player.removed",
    "players.snapshot",
    "bullet.fire.request",
    "bullet.fired",
    "bullet.resolved",
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

export const makeEnvelope = <TPayload>(
    type: EventEnvelope["type"],
    seq: number,
    payload: TPayload,
    version = "1"
): EventEnvelope => {
    return {
        type,
        version,
        seq,
        ts: Date.now(),
        payload
    };
};

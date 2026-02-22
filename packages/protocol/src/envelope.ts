import { Schema } from "@effect/schema";
import { Either } from "effect";
import { EventPayloadSchemas, type EventPayloadByType } from "./events.js";

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

export type TypedEventEnvelope<TType extends EventEnvelope["type"]> = Omit<EventEnvelope, "type" | "payload"> & {
    type: TType;
    payload: EventPayloadByType[TType];
};

const decodeEnvelope = Schema.decodeUnknownEither(EventEnvelope);

const payloadDecoders = {
    "lobby.join.request": Schema.decodeUnknownEither(EventPayloadSchemas["lobby.join.request"]),
    "player.update": Schema.decodeUnknownEither(EventPayloadSchemas["player.update"]),
    "player.health": Schema.decodeUnknownEither(EventPayloadSchemas["player.health"]),
    "player.dead": Schema.decodeUnknownEither(EventPayloadSchemas["player.dead"]),
    "player.removed": Schema.decodeUnknownEither(EventPayloadSchemas["player.removed"]),
    "players.snapshot": Schema.decodeUnknownEither(EventPayloadSchemas["players.snapshot"]),
    "bullet.fire.request": Schema.decodeUnknownEither(EventPayloadSchemas["bullet.fire.request"]),
    "bullet.fired": Schema.decodeUnknownEither(EventPayloadSchemas["bullet.fired"]),
    "bullet.resolved": Schema.decodeUnknownEither(EventPayloadSchemas["bullet.resolved"]),
    "building.place.request": Schema.decodeUnknownEither(EventPayloadSchemas["building.place.request"]),
    "building.placed": Schema.decodeUnknownEither(EventPayloadSchemas["building.placed"]),
    "building.demolish.request": Schema.decodeUnknownEither(EventPayloadSchemas["building.demolish.request"]),
    "building.demolished": Schema.decodeUnknownEither(EventPayloadSchemas["building.demolished"]),
    "lobby.assignment": Schema.decodeUnknownEither(EventPayloadSchemas["lobby.assignment"]),
    "chat.message": Schema.decodeUnknownEither(EventPayloadSchemas["chat.message"])
} as const;

export const decodeTypedEnvelope = (input: unknown) => {
    const envelopeResult = decodeEnvelope(input);
    if (envelopeResult._tag === "Left") {
        return envelopeResult;
    }

    const envelope = envelopeResult.right;
    const payloadResult = payloadDecoders[envelope.type](envelope.payload);
    if (payloadResult._tag === "Left") {
        return payloadResult;
    }

    return Either.right({
        ...envelope,
        payload: payloadResult.right
    } as TypedEventEnvelope<EventEnvelope["type"]>);
};

export const makeTypedEnvelope = <TType extends EventEnvelope["type"]>(
    type: TType,
    seq: number,
    payload: EventPayloadByType[TType],
    version = "1"
): TypedEventEnvelope<TType> => {
    return {
        type,
        version,
        seq,
        ts: Date.now(),
        payload
    };
};

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

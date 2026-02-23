import { Schema } from "@effect/schema";
import { Either } from "effect";
import { EventPayloadSchemas, type KnownEventPayloadByType } from "./events.js";
import { canonicalizeEventType } from "./event-type-adapter.js";

export const EventType = Schema.Literal(
    "bot:debug",
    "bot:debug:defenders",
    "build.denied",
    "build:denied",
    "bullet_shot",
    "chat:history",
    "chat:message",
    "chat:rate_limit",
    "chat.message.request",
    "chat.history",
    "chat.rate_limit",
    "city:defenses",
    "city:defenses:clear",
    "city:finance",
    "city.finance",
    "city:info",
    "city:inspect",
    "city:layout:import",
    "city:orbed",
    "city.orbed",
    "connect",
    "connect_error",
    "connected",
    "connection",
    "defense:deploy",
    "defense:remove",
    "defense:spawn",
    "defense:update",
    "demolish:denied",
    "demolish.denied",
    "demolish_building",
    "disconnect",
    "disconnected",
    "enter_game",
    "event",
    "event:rejected",
    "factory:collect",
    "factory:purge",
    "factory.collect.request",
    "factory.stock",
    "hazard:arm",
    "hazard:remove",
    "hazard:spawn",
    "hazard:update",
    "hazard.deploy.request",
    "hazard.spawn",
    "hazard.remove",
    "icon:drop",
    "icon:drop:result",
    "icon:pickup",
    "icon.pickup.request",
    "icon.pickup.confirmed",
    "icon:pickup:confirmed",
    "icon:pickup:rejected",
    "icon:pickup:result",
    "icon:remove",
    "inventory:update",
    "identity:ack",
    "identity:update",
    "item:use",
    "item.use.request",
    "item:use:rejected",
    "latency:ping",
    "latency:pong",
    "lobby:assignment",
    "lobby:denied",
    "lobby:evicted",
    "lobby:join:request",
    "lobby:leave",
    "lobby:refresh",
    "lobby:released",
    "lobby:snapshot",
    "lobby:update",
    "lobby.leave.request",
    "lobby.denied",
    "lobby.released",
    "lobby.snapshot",
    "new_building",
    "new_icon",
    "orb:drop",
    "orb.drop.request",
    "orb:lost",
    "orb:result",
    "ping",
    "player",
    "player:bot_damage",
    "player:dead",
    "player:health",
    "player:rejected",
    "player:removed",
    "player:status",
    "players:snapshot",
    "pong",
    "population:update",
    "request_fire",
    "research:update",
    "research.start.request",
    "research.update",
    "score:promotion",
    "score:profile",
    "score.promotion",
    "score.profile",
    "defense.deploy.request",
    "defense.spawn",
    "defense.update",
    "defense.remove",
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
    "chat.message",
    "inventory.update"
);

export const EventEnvelope = Schema.Struct({
    type: EventType,
    version: Schema.String,
    seq: Schema.Number,
    ts: Schema.Number,
    payload: Schema.Unknown
});

export type EventEnvelope = Schema.Schema.Type<typeof EventEnvelope>;
export type KnownEventType = keyof KnownEventPayloadByType;

type PayloadByEvent<TType extends EventEnvelope["type"]> =
    TType extends keyof KnownEventPayloadByType ? KnownEventPayloadByType[TType] : unknown;

export type TypedEventEnvelope<TType extends EventEnvelope["type"]> = Omit<EventEnvelope, "type" | "payload"> & {
    type: TType;
    payload: PayloadByEvent<TType>;
};
export type KnownTypedEventEnvelope<TType extends KnownEventType = KnownEventType> =
    TType extends KnownEventType
        ? Omit<EventEnvelope, "type" | "payload"> & {
            type: TType;
            payload: KnownEventPayloadByType[TType];
        }
        : never;

const decodeEnvelope = Schema.decodeUnknownEither(EventEnvelope);

export const KnownEventTypes = Object.keys(EventPayloadSchemas) as ReadonlyArray<KnownEventType>;

const decodeUnknownPayload = (eventType: KnownEventType) => {
    const schema = EventPayloadSchemas[eventType] as unknown as Schema.Schema<unknown, unknown, never>;
    return Schema.decodeUnknownEither(schema);
};

const payloadDecoders = Object.fromEntries(
    KnownEventTypes.map((eventType) => {
        return [eventType, decodeUnknownPayload(eventType)];
    })
) as Partial<Record<EventEnvelope["type"], (input: unknown) => Either.Either<unknown, unknown>>>;

export const decodeTypedEnvelope = (input: unknown) => {
    const envelopeResult = decodeEnvelope(input);
    if (envelopeResult._tag === "Left") {
        return envelopeResult;
    }

    const envelope = envelopeResult.right;
    const canonicalType = canonicalizeEventType(envelope.type) as EventEnvelope["type"];
    const canonicalEnvelope = {
        ...envelope,
        type: canonicalType
    };
    const payloadDecoder = payloadDecoders[canonicalType];
    if (!payloadDecoder) {
        return Either.right(canonicalEnvelope as TypedEventEnvelope<EventEnvelope["type"]>);
    }

    const payloadResult = payloadDecoder(canonicalEnvelope.payload);
    if (payloadResult._tag === "Left") {
        return payloadResult;
    }

    return Either.right({
        ...canonicalEnvelope,
        payload: payloadResult.right
    } as TypedEventEnvelope<EventEnvelope["type"]>);
};

const hasKnownSchema = (type: EventEnvelope["type"]): type is KnownEventType => {
    return KnownEventTypes.includes(type as KnownEventType);
};

export const decodeKnownEnvelope = (input: unknown) => {
    const decoded = decodeTypedEnvelope(input);
    if (decoded._tag === "Left") {
        return decoded;
    }

    if (!hasKnownSchema(decoded.right.type)) {
        return Either.left({
            _tag: "UnknownEventType",
            type: decoded.right.type
        });
    }

    return Either.right(decoded.right as KnownTypedEventEnvelope);
};

export const makeTypedEnvelope = <TType extends EventEnvelope["type"]>(
    type: TType,
    seq: number,
    payload: PayloadByEvent<TType>,
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
    const canonicalType = canonicalizeEventType(type);
    return {
        type: canonicalType as EventEnvelope["type"],
        version,
        seq,
        ts: Date.now(),
        payload
    };
};

export const makeKnownEnvelope = <TType extends KnownEventType>(
    type: TType,
    seq: number,
    payload: KnownEventPayloadByType[TType],
    version = "1"
): KnownTypedEventEnvelope<TType> => {
    return {
        type,
        version,
        seq,
        ts: Date.now(),
        payload
    } as KnownTypedEventEnvelope<TType>;
};

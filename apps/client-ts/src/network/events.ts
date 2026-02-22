import type { EventEnvelope, KnownEventPayloadByType } from "@battlecity/protocol";

export type EnvelopeType = EventEnvelope["type"];

export type EventSender = <TType extends EnvelopeType>(
    type: TType,
    payload: TType extends keyof KnownEventPayloadByType ? KnownEventPayloadByType[TType] : unknown
) => void;

import { decodeKnownEnvelope, type KnownTypedEventEnvelope } from "@battlecity/protocol";
import { Effect } from "effect";
import { normalizeInboundEnvelopeType } from "./event-adapter.js";

export const decodeServerEnvelope = (raw: unknown): Effect.Effect<KnownTypedEventEnvelope | null> => {
    return Effect.sync(() => decodeKnownEnvelope(normalizeInboundEnvelopeType(raw))).pipe(
        Effect.map((decoded) => {
            if (decoded._tag !== "Right") {
                return null;
            }
            return decoded.right;
        })
    );
};

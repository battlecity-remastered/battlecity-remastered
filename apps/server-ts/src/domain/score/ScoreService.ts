import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { Effect } from "effect";
import type { UserStoreAdapter } from "../../adapters/persistence/UserStoreAdapter.js";

export const profileForSocket = (
    userStore: UserStoreAdapter,
    socketId: string,
    userId: string
): Effect.Effect<KnownEventPayloadByType["score.profile"]> => {
    return Effect.map(userStore.getOrCreate(userId), (profile) => {
        return {
            playerId: socketId,
            userId: profile.id,
            score: profile.score,
            rank: profile.rank
        };
    });
};

export const awardOrbProfileScore = (
    userStore: UserStoreAdapter,
    socketId: string,
    userId: string,
    amount: number
): Effect.Effect<KnownEventPayloadByType["score.profile"]> => {
    return Effect.map(userStore.addScore(userId, amount), (profile) => {
        return {
            playerId: socketId,
            userId: profile.id,
            score: profile.score,
            rank: profile.rank
        };
    });
};


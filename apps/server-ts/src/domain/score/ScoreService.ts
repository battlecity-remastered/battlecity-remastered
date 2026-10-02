import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { Effect } from "effect";
import type { UserStoreAdapter } from "../../adapters/persistence/UserStoreAdapter.js";
import type { RuntimeState } from "../../runtime/types.js";

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

export const lobbyHighScores = (
    userStore: UserStoreAdapter,
    state: RuntimeState,
    limit = 20
): Effect.Effect<KnownEventPayloadByType["lobby.high_scores"]> => {
    return Effect.map(userStore.listTop(limit), (profiles) => {
        // Refresh with the existing leaderboard work, never in the tick loop.
        const leader = profiles[0];
        state.scoreLeaderUserId = leader && leader.score > 0 ? leader.id : null;
        return profiles.map((profile) => ({
            userId: profile.id,
            name: profile.name,
            points: profile.score,
            rankTitle: profile.rank,
            orbs: profile.orbs,
            assists: profile.assists,
            updatedAt: profile.updatedAt
        }));
    });
};

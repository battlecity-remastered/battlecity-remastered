import { Effect } from "effect";

export type RuntimeUserProfile = {
    id: string;
    score: number;
    rank: string;
};

const rankFromScore = (score: number): string => {
    if (score >= 2000) {
        return "general";
    }
    if (score >= 1200) {
        return "captain";
    }
    if (score >= 600) {
        return "sergeant";
    }
    return "recruit";
};

export class UserStoreAdapter {
    private readonly users = new Map<string, RuntimeUserProfile>();

    public getOrCreate(userId: string): Effect.Effect<RuntimeUserProfile> {
        return Effect.sync(() => {
            const existing = this.users.get(userId);
            if (existing) {
                return existing;
            }
            const created: RuntimeUserProfile = {
                id: userId,
                score: 0,
                rank: "recruit"
            };
            this.users.set(userId, created);
            return created;
        });
    }

    public addScore(userId: string, amount: number): Effect.Effect<RuntimeUserProfile> {
        return Effect.sync(() => {
            const existing = this.users.get(userId) ?? {
                id: userId,
                score: 0,
                rank: "recruit"
            };
            const nextScore = Math.max(0, existing.score + Math.floor(amount));
            const updated: RuntimeUserProfile = {
                id: userId,
                score: nextScore,
                rank: rankFromScore(nextScore)
            };
            this.users.set(userId, updated);
            return updated;
        });
    }
}

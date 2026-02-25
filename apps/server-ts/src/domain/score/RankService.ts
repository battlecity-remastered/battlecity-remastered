export type RankThreshold = {
    limit: number;
    title: string;
};

export const RANK_THRESHOLDS: ReadonlyArray<RankThreshold> = Object.freeze([
    { limit: 100, title: "Private" },
    { limit: 200, title: "Corporal" },
    { limit: 500, title: "Sergeant" },
    { limit: 1000, title: "Sergeant Major" },
    { limit: 2000, title: "Lieutenant" },
    { limit: 4000, title: "Captain" },
    { limit: 8000, title: "Major" },
    { limit: 16000, title: "Colonel" },
    { limit: 30000, title: "Brigadier" },
    { limit: 45000, title: "General" },
    { limit: 60000, title: "Baron" },
    { limit: 80000, title: "Earl" },
    { limit: 100000, title: "Count" },
    { limit: 125000, title: "Duke" },
    { limit: 150000, title: "Archduke" },
    { limit: 200000, title: "Grand Duke" },
    { limit: 250000, title: "Lord" },
    { limit: 300000, title: "Chancellor" },
    { limit: 350000, title: "Royaume" },
    { limit: 400000, title: "Emperor" },
    { limit: 500000, title: "Auror" },
    { limit: Number.POSITIVE_INFINITY, title: "King" }
]);

export const clampToNonNegativeInt = (value: unknown): number => {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.floor(numeric));
};

export const resolveRankTitle = (points: unknown): string => {
    const score = clampToNonNegativeInt(points);
    for (const threshold of RANK_THRESHOLDS) {
        if (score < threshold.limit) {
            return threshold.title;
        }
    }
    return RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1]?.title ?? "Private";
};

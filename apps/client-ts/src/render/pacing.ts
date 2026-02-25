export const isRefreshDue = (
    lastRefreshAt: number | null,
    nowMs: number,
    intervalMs: number
): boolean => {
    if (!Number.isFinite(nowMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) {
        return true;
    }
    if (lastRefreshAt === null) {
        return true;
    }
    return (nowMs - lastRefreshAt) >= intervalMs;
};

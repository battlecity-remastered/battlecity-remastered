export const normalizeThrottle = (throttle: number): -1 | 0 | 1 => {
    if (throttle > 0) {
        return 1;
    }
    if (throttle < 0) {
        return -1;
    }
    return 0;
};

export const toFiniteNumber = (value: unknown, fallback: number): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

type DiagnosticMeta = Record<string, unknown>;

const MOVEMENT_DIAG_STORAGE_KEY = "bc_diag_movement";
const MOVEMENT_DIAG_QUERY_KEY = "diagMovement";
const EMIT_INTERVAL_MS = 300;

let cachedEnabled: boolean | null = null;
let cacheCheckedAt = 0;
const lastEmitAtByChannel = new Map<string, number>();

const resolveEnabled = (): boolean => {
    if (typeof window === "undefined") {
        return false;
    }
    const now = Date.now();
    if (cachedEnabled !== null && (now - cacheCheckedAt) < 1000) {
        return cachedEnabled;
    }
    cacheCheckedAt = now;
    const params = new URLSearchParams(window.location.search);
    if (params.get(MOVEMENT_DIAG_QUERY_KEY) === "1") {
        cachedEnabled = true;
        return true;
    }
    cachedEnabled = window.localStorage.getItem(MOVEMENT_DIAG_STORAGE_KEY) === "1";
    return cachedEnabled;
};

export const isMovementDiagEnabled = (): boolean => {
    return resolveEnabled();
};

export const logMovementDiag = (channel: string, meta: DiagnosticMeta): void => {
    if (!resolveEnabled()) {
        return;
    }
    const now = Date.now();
    const lastEmitAt = lastEmitAtByChannel.get(channel) ?? 0;
    if ((now - lastEmitAt) < EMIT_INTERVAL_MS) {
        return;
    }
    lastEmitAtByChannel.set(channel, now);
    console.info(`[diag.movement.${channel}]`, {
        ts: new Date(now).toISOString(),
        ...meta
    });
};

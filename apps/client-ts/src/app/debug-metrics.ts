import type { ClientState } from "./state.js";

const MAX_LATENCY_SAMPLES = 40;
const MAX_SEND_INTERVALS = 60;
const STALE_UPDATE_THRESHOLD_MS = 66;

const pushWindowedSample = (samples: number[], value: number, maxSize: number): void => {
    if (!Number.isFinite(value) || value <= 0) {
        return;
    }
    samples.push(value);
    while (samples.length > maxSize) {
        samples.shift();
    }
};

const computeAverage = (samples: ReadonlyArray<number>): number | null => {
    if (samples.length === 0) {
        return null;
    }
    const sum = samples.reduce((acc, value) => acc + value, 0);
    return sum / samples.length;
};

const computeJitter = (samples: ReadonlyArray<number>, average: number | null): number | null => {
    if (samples.length === 0 || average === null) {
        return null;
    }
    const variance = samples.reduce((acc, value) => acc + Math.abs(value - average), 0);
    return variance / samples.length;
};

const resolveRateFromDelta = (deltaMs: number | null): number | null => {
    if (!Number.isFinite(deltaMs) || deltaMs === null || deltaMs <= 0) {
        return null;
    }
    return 1000 / deltaMs;
};

const formatRate = (value: number | null): string => {
    if (!Number.isFinite(value) || value === null || value <= 0) {
        return "n/a";
    }
    return value.toFixed(1);
};

const formatMs = (value: number | null): string => {
    if (!Number.isFinite(value) || value === null) {
        return "n/a";
    }
    return `${Math.round(value)} ms`;
};

export const toggleDebugMode = (state: ClientState): void => {
    state.ui.showBotDebug = !state.ui.showBotDebug;
};

export const recordDebugUpdateTick = (state: ClientState, nowMs: number = Date.now()): void => {
    const loop = state.debug.loop;
    loop.updateCount += 1;
    if (loop.lastUpdateAt !== null) {
        const delta = Math.max(0, nowMs - loop.lastUpdateAt);
        loop.updateHz = resolveRateFromDelta(delta);
    }
    loop.lastUpdateAt = nowMs;
};

export const recordDebugRenderTick = (state: ClientState, nowMs: number = Date.now()): void => {
    const loop = state.debug.loop;
    loop.renderCount += 1;
    if (loop.lastRenderAt !== null) {
        const delta = Math.max(0, nowMs - loop.lastRenderAt);
        loop.renderHz = resolveRateFromDelta(delta);
    }
    if (loop.lastUpdateAt !== null) {
        loop.lastRenderDeltaMs = Math.max(0, nowMs - loop.lastUpdateAt);
    }
    if (loop.lastUpdateAt !== null && (nowMs - loop.lastUpdateAt) > STALE_UPDATE_THRESHOLD_MS) {
        loop.mismatchEvents += 1;
    }
    loop.lastRenderAt = nowMs;
};

export const recordDebugOutboundSend = (state: ClientState, nowMs: number = Date.now()): void => {
    const send = state.debug.send;
    if (send.lastSentAt !== null) {
        pushWindowedSample(send.intervals, Math.max(0, nowMs - send.lastSentAt), MAX_SEND_INTERVALS);
        const avg = computeAverage(send.intervals);
        send.avgMs = avg;
        send.hz = resolveRateFromDelta(avg);
    }
    send.lastSentAt = nowMs;
};

export const recordDebugServerEvent = (state: ClientState, nowMs: number = Date.now()): void => {
    state.debug.lastServerEventAt = nowMs;
};

export const recordDebugSocketState = (
    state: ClientState,
    connected: boolean
): void => {
    state.debug.socketConnected = connected;
};

export const recordDebugRejection = (
    state: ClientState,
    reason: string | null,
    nowMs: number = Date.now()
): void => {
    const send = state.debug.send;
    send.rejections += 1;
    send.lastRejection = reason;
    send.lastRejectionAt = nowMs;
};

export const recordDebugLatencySample = (
    state: ClientState,
    latencyMs: number,
    nowMs: number = Date.now()
): void => {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
        return;
    }
    const stats = state.debug.latency;
    pushWindowedSample(stats.samples, latencyMs, MAX_LATENCY_SAMPLES);
    const average = computeAverage(stats.samples);
    stats.latest = latencyMs;
    stats.avg = average;
    stats.min = stats.samples.length > 0 ? Math.min(...stats.samples) : null;
    stats.max = stats.samples.length > 0 ? Math.max(...stats.samples) : null;
    stats.jitter = computeJitter(stats.samples, average);
    stats.updatedAt = nowMs;
};

const appendLatencyLines = (lines: string[], state: ClientState, nowMs: number): void => {
    const latency = state.debug.latency;
    if (latency.latest === null) {
        lines.push("Ping: n/a");
        return;
    }

    const latest = Math.round(latency.latest);
    const average = Math.round(latency.avg ?? latest);
    const jitter = Math.round(latency.jitter ?? 0);
    const min = Math.round(latency.min ?? latest);
    const max = Math.round(latency.max ?? latest);
    lines.push(`Ping: ${latest} ms (avg ${average}, jitter ${jitter}, min ${min}, max ${max}, n=${latency.samples.length})`);
    if (latency.updatedAt !== null) {
        lines.push(`Last pong: ${Math.max(0, nowMs - latency.updatedAt)} ms ago`);
    }
};

const appendSendLines = (lines: string[], state: ClientState, nowMs: number): void => {
    const send = state.debug.send;
    if (send.hz !== null || send.avgMs !== null) {
        lines.push(`Client sends: ${formatRate(send.hz)} Hz (avg ${formatRate(send.avgMs)} ms)`);
    }
    if (send.rejections === 0) {
        return;
    }

    const age = send.lastRejectionAt !== null
        ? `${Math.max(0, nowMs - send.lastRejectionAt)} ms ago`
        : "";
    const suffix = send.lastRejection ? ` last=${send.lastRejection}${age ? ` ${age}` : ""}` : "";
    lines.push(`Rejections: ${send.rejections}${suffix}`);
};

const appendLoopLines = (lines: string[], state: ClientState): void => {
    const loop = state.debug.loop;
    const mismatch = loop.mismatchEvents > 0 ? `, stale updates ${loop.mismatchEvents}` : "";
    lines.push(`Render/update: ${loop.renderCount}/${loop.updateCount} (last render +${formatMs(loop.lastRenderDeltaMs)}${mismatch})`);
    lines.push(`FPS: ${formatRate(loop.renderHz)}  Tick: ${formatRate(loop.updateHz)} Hz`);
};

export const buildDebugHudLines = (state: ClientState, nowMs: number = Date.now()): string[] => {
    const lines: string[] = [];
    appendLatencyLines(lines, state, nowMs);
    appendSendLines(lines, state, nowMs);
    appendLoopLines(lines, state);
    lines.push(`Socket: ${state.debug.socketConnected ? "connected" : "disconnected"}`);
    if (state.debug.lastServerEventAt !== null) {
        lines.push(`Last server event: ${Math.max(0, nowMs - state.debug.lastServerEventAt)} ms ago`);
    }
    return lines;
};

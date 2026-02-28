const DEFAULT_SCENARIOS = [
    { name: "rtt20_j0_l0", rttMs: 20, jitterMs: 0, loss: 0 },
    { name: "rtt60_j10_l0", rttMs: 60, jitterMs: 10, loss: 0 },
    { name: "rtt100_j25_l0.5", rttMs: 100, jitterMs: 25, loss: 0.005 },
    { name: "rtt160_j40_l1", rttMs: 160, jitterMs: 40, loss: 0.01 }
];

const SIM_DURATION_MS = 20_000;
const CLIENT_TICK_MS = 33;
const SERVER_STEP_MS = 33;
const SNAPSHOT_TICK_MS = 100;
const RENDER_TICK_MS = 16;
const PLAYER_SPEED = 600;
const MAP_MAX = 24_576;
const SPRITE_SIZE = 48;
const HARD_RECONCILE = 72;
const SOFT_RECONCILE = 12;
const SOFT_GAIN = 0.2;
const MOVING_RECONCILE = 64;
const MOVING_GAIN = 0.12;
const HISTORY_MAX = 12;
const INTERP_DELAY_MS = 90;
const MAX_EXTRAP_MS = 120;
const MIN_ALLOWANCE = 24;
const MAX_ALLOWANCE = 420;
const HEADROOM = 2.5;
const BASE_ALLOWANCE = 80;

const seeded = (seed) => {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const movementPhase = (timeMs) => {
    if (timeMs < 4_000) {
        return { throttle: 1 };
    }
    if (timeMs < 8_000) {
        return { throttle: 0 };
    }
    if (timeMs < 12_000) {
        return { throttle: 1 };
    }
    return { throttle: 0 };
};

const expectedPathPosition = (timeMs) => {
    if (timeMs <= 0) {
        return 0;
    }
    const phase1 = Math.min(timeMs, 4_000);
    let position = (phase1 / 1000) * PLAYER_SPEED;
    if (timeMs > 8_000) {
        const phase3 = Math.min(timeMs - 8_000, 4_000);
        position += (phase3 / 1000) * PLAYER_SPEED;
    }
    return position;
};

const resolveAllowance = (lastAcceptedUpdateAt, nowMs) => {
    const previousAt = Number.isFinite(lastAcceptedUpdateAt) ? lastAcceptedUpdateAt : (nowMs - SERVER_STEP_MS);
    const elapsedMs = Math.max(SERVER_STEP_MS, nowMs - previousAt);
    const travel = PLAYER_SPEED * (elapsedMs / 1000);
    const adaptive = (travel * HEADROOM) + MIN_ALLOWANCE;
    return clamp(Math.max(BASE_ALLOWANCE, adaptive), MIN_ALLOWANCE, MAX_ALLOWANCE);
};

const normalizeSnapshotTarget = (history, nowMs) => {
    if (history.length === 0) {
        return null;
    }
    if (history.length === 1) {
        return history[0];
    }
    const targetTime = nowMs - INTERP_DELAY_MS;
    for (let i = 0; i < history.length - 1; i += 1) {
        const a = history[i];
        const b = history[i + 1];
        if (targetTime < a.serverTime || targetTime > b.serverTime) {
            continue;
        }
        const dt = Math.max(1, b.serverTime - a.serverTime);
        const alpha = clamp((targetTime - a.serverTime) / dt, 0, 1);
        return { x: a.x + ((b.x - a.x) * alpha), serverTime: targetTime };
    }
    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    const dt = Math.max(1, latest.serverTime - previous.serverTime);
    const vx = (latest.x - previous.x) / dt;
    const extra = clamp(targetTime - latest.serverTime, 0, MAX_EXTRAP_MS);
    return { x: latest.x + (vx * extra), serverTime: targetTime };
};

const runScenario = (scenario, seed) => {
    const rng = seeded(seed);
    const oneWay = scenario.rttMs / 2;
    const jitterRange = scenario.jitterMs;
    const queueToServer = [];
    const queueToClient = [];
    const enqueue = (queue, timeMs, payload) => queue.push({ at: timeMs, payload });
    const popReady = (queue, nowMs) => {
        const ready = [];
        for (let i = queue.length - 1; i >= 0; i -= 1) {
            if (queue[i].at <= nowMs) {
                ready.push(queue[i].payload);
                queue.splice(i, 1);
            }
        }
        return ready.reverse();
    };
    const transmitDelay = () => oneWay + ((rng() * 2 - 1) * jitterRange);
    const maybeDrop = () => rng() < scenario.loss;

    let nowMs = 0;
    let nextClientTick = 0;
    let nextServerTick = 0;
    let nextSnapshotTick = 0;
    let nextRenderTick = 0;

    let clientX = 0;
    let clientRenderedX = 0;
    let previousClientX = 0;
    let serverX = 0;
    let lastAcceptedUpdateAt = 0;
    let isMoving = false;

    const snapshotHistory = [];
    const correctionEvents = [];
    const pathErrors = [];
    const renderedSamples = [];

    let firstMoveInputAt = null;
    let firstVisibleMoveAt = null;
    let keyUpAt = null;
    let stopSettledAt = null;
    let invalidRejections = 0;

    while (nowMs <= SIM_DURATION_MS) {
        const step = movementPhase(nowMs);
        const expected = expectedPathPosition(nowMs);
        pathErrors.push(Math.abs(clientRenderedX - expected));
        renderedSamples.push({ t: nowMs, x: clientRenderedX });

        for (const packet of popReady(queueToServer, nowMs)) {
            const allowance = resolveAllowance(lastAcceptedUpdateAt, nowMs);
            const distance = Math.abs(packet.offset - serverX);
            if (distance > allowance) {
                invalidRejections += 1;
                continue;
            }
            const throttle = packet.throttle;
            serverX += ((PLAYER_SPEED * throttle) * (SERVER_STEP_MS / 1000));
            serverX = clamp(serverX, 0, MAP_MAX - SPRITE_SIZE);
            lastAcceptedUpdateAt = nowMs;
        }

        for (const packet of popReady(queueToClient, nowMs)) {
            snapshotHistory.push(packet);
            while (snapshotHistory.length > HISTORY_MAX) {
                snapshotHistory.shift();
            }
        }

        if (nowMs >= nextClientTick) {
            nextClientTick += CLIENT_TICK_MS;
            previousClientX = clientX;
            clientX += ((PLAYER_SPEED * step.throttle) * (CLIENT_TICK_MS / 1000));
            clientX = clamp(clientX, 0, MAP_MAX - SPRITE_SIZE);
            isMoving = step.throttle !== 0;
            if (step.throttle !== 0 && firstMoveInputAt === null) {
                firstMoveInputAt = nowMs;
            }
            if (step.throttle === 0 && keyUpAt === null && nowMs >= 4_000) {
                keyUpAt = nowMs;
            }
            if (!maybeDrop()) {
                enqueue(queueToServer, nowMs + transmitDelay(), {
                    offset: clientX,
                    throttle: step.throttle
                });
            }
        }

        if (nowMs >= nextServerTick) {
            nextServerTick += SERVER_STEP_MS;
            // server movement is driven by accepted inputs above.
        }

        if (nowMs >= nextSnapshotTick) {
            nextSnapshotTick += SNAPSHOT_TICK_MS;
            if (!maybeDrop()) {
                enqueue(queueToClient, nowMs + transmitDelay(), {
                    serverTime: nowMs,
                    x: serverX
                });
            }
        }

        if (nowMs >= nextRenderTick) {
            nextRenderTick += RENDER_TICK_MS;
            const target = normalizeSnapshotTarget(snapshotHistory, nowMs);
            if (target) {
                const dx = target.x - clientX;
                const drift = Math.abs(dx);
                if (drift > HARD_RECONCILE) {
                    correctionEvents.push(drift);
                    clientX = target.x;
                } else if (isMoving && drift > MOVING_RECONCILE) {
                    const delta = dx * MOVING_GAIN;
                    correctionEvents.push(Math.abs(delta));
                    clientX += delta;
                } else if (!isMoving && drift > SOFT_RECONCILE) {
                    const delta = dx * SOFT_GAIN;
                    correctionEvents.push(Math.abs(delta));
                    clientX += delta;
                }
            }

            const stepX = clientX - previousClientX;
            clientRenderedX = clientX + (stepX * clamp((nowMs % CLIENT_TICK_MS) / CLIENT_TICK_MS, 0, 1));
            if (firstMoveInputAt !== null && firstVisibleMoveAt === null && Math.abs(clientRenderedX) > 1) {
                firstVisibleMoveAt = nowMs;
            }
            if (keyUpAt !== null && stopSettledAt === null && nowMs > keyUpAt + 50) {
                const recent = renderedSamples.slice(-12);
                if (recent.length >= 8) {
                    const drift = Math.max(...recent.map((p) => Math.abs(p.x - recent[0].x)));
                    if (drift < 1.5) {
                        stopSettledAt = nowMs;
                    }
                }
            }
        }

        nowMs += 1;
    }

    const sortedErrors = [...pathErrors].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedErrors.length * 0.95);
    const idleWindow = renderedSamples.filter((s) => s.t >= 12_000);
    const idleBase = idleWindow.length > 0 ? idleWindow[0].x : clientRenderedX;
    const idleDrift = idleWindow.length > 0
        ? Math.max(...idleWindow.map((s) => Math.abs(s.x - idleBase)))
        : 0;

    return {
        scenario: scenario.name,
        rttMs: scenario.rttMs,
        jitterMs: scenario.jitterMs,
        lossPct: scenario.loss * 100,
        inputToVisibleMs: firstMoveInputAt !== null && firstVisibleMoveAt !== null
            ? Math.max(0, firstVisibleMoveAt - firstMoveInputAt)
            : null,
        stopSettlingMs: keyUpAt !== null && stopSettledAt !== null
            ? Math.max(0, stopSettledAt - keyUpAt)
            : null,
        idleDriftPx: Number(idleDrift.toFixed(2)),
        pathErrorMeanPx: Number((pathErrors.reduce((a, b) => a + b, 0) / pathErrors.length).toFixed(2)),
        pathErrorP95Px: Number((sortedErrors[p95Index] ?? 0).toFixed(2)),
        correctionCount: correctionEvents.length,
        correctionGt24: correctionEvents.filter((v) => v > 24).length,
        correctionMaxPx: Number((correctionEvents.length > 0 ? Math.max(...correctionEvents) : 0).toFixed(2)),
        invalidRejections
    };
};

const format = (value) => (value === null || value === undefined ? "n/a" : String(value));

const printTable = (rows) => {
    const columns = [
        "scenario",
        "rttMs",
        "jitterMs",
        "lossPct",
        "inputToVisibleMs",
        "stopSettlingMs",
        "idleDriftPx",
        "pathErrorMeanPx",
        "pathErrorP95Px",
        "correctionCount",
        "correctionGt24",
        "correctionMaxPx",
        "invalidRejections"
    ];
    const header = `| ${columns.join(" | ")} |`;
    const sep = `| ${columns.map(() => "---").join(" | ")} |`;
    console.log(header);
    console.log(sep);
    for (const row of rows) {
        console.log(`| ${columns.map((c) => format(row[c])).join(" | ")} |`);
    }
};

const runs = [];
for (let i = 0; i < DEFAULT_SCENARIOS.length; i += 1) {
    runs.push(runScenario(DEFAULT_SCENARIOS[i], 1337 + (i * 17)));
}

printTable(runs);

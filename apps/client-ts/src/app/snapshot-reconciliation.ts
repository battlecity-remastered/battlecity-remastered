import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { logMovementDiag } from "./movement-diagnostics.js";
import { LEGACY_PLAYER_SPEED_PX_PER_SECOND } from "./player-constants.js";
import type { ClientState, RemotePlayer } from "./state-types.js";
import { reconcilePredictedMovement } from "./movement-prediction.js";

// Server authority plus WAN latency causes small drift; soften correction to avoid visible jitter.
const LOCAL_SNAPSHOT_SOFT_RECONCILE_DISTANCE_PX = 22;
const LOCAL_SNAPSHOT_HARD_RECONCILE_DISTANCE_PX = 84;
const LOCAL_SNAPSHOT_MOVING_RECONCILE_DISTANCE_PX = 61;
const LOCAL_SNAPSHOT_MOVING_RECONCILE_GAIN = 0.101;
const LOCAL_SNAPSHOT_HISTORY_MAX = 10;
const LOCAL_SNAPSHOT_INTERPOLATION_DELAY_MOVING_MS = 16;
const LOCAL_SNAPSHOT_INTERPOLATION_DELAY_REST_MS = 48;
const LOCAL_SNAPSHOT_MAX_EXTRAPOLATION_MS = 153;
const LOCAL_DIRECTION_RECONCILE_HOLDOFF_MS = 140;

type PlayersSnapshotPayload = KnownEventPayloadByType["players.snapshot"];
type PlayersSnapshotEntry = PlayersSnapshotPayload extends { players: ReadonlyArray<infer TPlayer>; } ? TPlayer : never;

const normalizeDirection32Step = (direction: number): number => {
    if (!Number.isFinite(direction)) {
        return 0;
    }
    const normalized = Math.round(direction) % 32;
    return normalized < 0 ? normalized + 32 : normalized;
};

const normalizeSnapshotEntry = (player: PlayersSnapshotEntry): PlayersSnapshotEntry => {
    return {
        ...player,
        direction: normalizeDirection32Step(player.direction)
    };
};

const normalizePlayersSnapshotPayload = (
    payload: PlayersSnapshotPayload
): { serverTime: number; players: ReadonlyArray<PlayersSnapshotEntry>; } => {
    if (Array.isArray(payload)) {
        return {
            serverTime: Date.now(),
            players: (payload as unknown as PlayersSnapshotEntry[]).map(normalizeSnapshotEntry)
        };
    }
    const serverTime = Number.isFinite(payload.serverTime) ? payload.serverTime : Date.now();
    return {
        serverTime,
        players: payload.players.map(normalizeSnapshotEntry)
    };
};

const pushAuthoritativeSnapshot = (
    state: ClientState,
    serverTime: number,
    player: PlayersSnapshotEntry
): void => {
    const history = state.render.authoritativeSnapshots;
    const previous = history.length > 0 ? history[history.length - 1] : null;
    if (previous && previous.serverTime === serverTime) {
        previous.x = player.offset.x;
        previous.y = player.offset.y;
        previous.direction = player.direction;
        return;
    }
    history.push({
        serverTime,
        x: player.offset.x,
        y: player.offset.y,
        direction: player.direction
    });
    while (history.length > LOCAL_SNAPSHOT_HISTORY_MAX) {
        history.shift();
    }
};

const resolveAuthoritativeTarget = (
    state: ClientState,
    nowMs: number,
    interpolationDelayMs: number,
    allowExtrapolation = true
): { x: number; y: number; direction: number; } | null => {
    const history = state.render.authoritativeSnapshots;
    if (history.length === 0) {
        return null;
    }
    if (history.length === 1) {
        const only = history[0]!;
        return { x: only.x, y: only.y, direction: only.direction };
    }

    const targetTime = nowMs - interpolationDelayMs;
    for (let index = 0; index < history.length - 1; index += 1) {
        const current = history[index]!;
        const next = history[index + 1]!;
        if (targetTime < current.serverTime || targetTime > next.serverTime) {
            continue;
        }
        const dt = Math.max(1, next.serverTime - current.serverTime);
        const alpha = Math.max(0, Math.min(1, (targetTime - current.serverTime) / dt));
        return {
            x: current.x + ((next.x - current.x) * alpha),
            y: current.y + ((next.y - current.y) * alpha),
            direction: next.direction
        };
    }

    const latest = history[history.length - 1]!;
    const previous = history[history.length - 2]!;
    const dt = Math.max(1, latest.serverTime - previous.serverTime);
    const vx = (latest.x - previous.x) / dt;
    const vy = (latest.y - previous.y) / dt;
    const extrapolationMs = allowExtrapolation ? Math.max(0, Math.min(
        LOCAL_SNAPSHOT_MAX_EXTRAPOLATION_MS,
        targetTime - latest.serverTime
    )) : 0;
    return {
        x: latest.x + (vx * extrapolationMs),
        y: latest.y + (vy * extrapolationMs),
        direction: latest.direction
    };
};

const reconcilePosition = (state: ClientState, targetX: number, targetY: number, targetDirection: number, isLocallyMoving: boolean, isLocallyTurning: boolean, canApplyAuthoritativeDirection: boolean): void => {
    const dx = targetX - state.local.x, dy = targetY - state.local.y, driftSq = dx * dx + dy * dy, drift = Math.sqrt(driftSq);
    if (driftSq > (LOCAL_SNAPSHOT_HARD_RECONCILE_DISTANCE_PX ** 2)) {
        logMovementDiag("reconcile.hard_snap", {
            playerId: state.local.id,
            isLocallyMoving,
            isLocallyTurning,
            canApplyAuthoritativeDirection,
            drift: Number(drift.toFixed(2)),
            local: {
                x: Number(state.local.x.toFixed(2)),
                y: Number(state.local.y.toFixed(2)),
                direction: Number(state.local.direction.toFixed(3))
            },
            target: {
                x: Number(targetX.toFixed(2)),
                y: Number(targetY.toFixed(2)),
                direction: Number(targetDirection.toFixed(3))
            },
            pingMs: state.debug.latency.latest
        });
        state.local.x = targetX;
        state.local.y = targetY;
        state.local.direction = targetDirection;
        state.render.previousLocalX = targetX;
        state.render.previousLocalY = targetY;
        state.render.projectedOffsetX = 0;
        state.render.projectedOffsetY = 0;
        state.render.lastResolvedAt = null;
    } else if (
        isLocallyMoving
        && driftSq > (LOCAL_SNAPSHOT_MOVING_RECONCILE_DISTANCE_PX ** 2)
    ) {
        logMovementDiag("reconcile.moving_soft", {
            playerId: state.local.id,
            drift: Number(drift.toFixed(2)),
            gain: LOCAL_SNAPSHOT_MOVING_RECONCILE_GAIN,
            local: {
                x: Number(state.local.x.toFixed(2)),
                y: Number(state.local.y.toFixed(2)),
                direction: Number(state.local.direction.toFixed(3))
            },
            target: {
                x: Number(targetX.toFixed(2)),
                y: Number(targetY.toFixed(2)),
                direction: Number(targetDirection.toFixed(3))
            }
        });
        // While moving on higher-latency links, avoid tiny snap-back corrections.
        state.local.x += dx * LOCAL_SNAPSHOT_MOVING_RECONCILE_GAIN;
        state.local.y += dy * LOCAL_SNAPSHOT_MOVING_RECONCILE_GAIN;
    } else if (!isLocallyMoving && driftSq > (LOCAL_SNAPSHOT_SOFT_RECONCILE_DISTANCE_PX ** 2)) {
        logMovementDiag("reconcile.rest_snap", {
            playerId: state.local.id,
            drift: Number(drift.toFixed(2)),
            local: {
                x: Number(state.local.x.toFixed(2)),
                y: Number(state.local.y.toFixed(2))
            },
            target: {
                x: Number(targetX.toFixed(2)),
                y: Number(targetY.toFixed(2))
            }
        });
        // No easing at rest: snap immediately to avoid visible "slow stop" drift.
        state.local.x = targetX;
        state.local.y = targetY;
    }
};

const updateLocalSnapshot = (state: ClientState, player: PlayersSnapshotEntry, serverTime: number, nowMs: number, interpolationDelayMs: number, isLocallyMoving: boolean, isLocallyTurning: boolean, canApplyAuthoritativeDirection: boolean): void => {
    state.local.cloakedUntil = player.cloakedUntil ?? 0; state.local.frozenUntil = player.frozenUntil ?? 0;
    state.local.city = player.city;
    state.local.speed = LEGACY_PLAYER_SPEED_PX_PER_SECOND;
    if (typeof player.health === "number") state.local.health = player.health;
    if (typeof player.maxHealth === "number") state.local.maxHealth = player.maxHealth;
    if (player.movementAck) {
        reconcilePredictedMovement(state, player);
        return;
    }
    pushAuthoritativeSnapshot(state, serverTime, player);
    const authoritative = resolveAuthoritativeTarget(state, nowMs, interpolationDelayMs, isLocallyMoving);
    if (canApplyAuthoritativeDirection) {
        state.local.direction = authoritative?.direction ?? player.direction;
    }
    const targetX = authoritative?.x ?? player.offset.x;
    const targetY = authoritative?.y ?? player.offset.y;
    const targetDirection = canApplyAuthoritativeDirection
        ? (authoritative?.direction ?? player.direction)
        : state.local.direction;
    const drift = Math.hypot(targetX - state.local.x, targetY - state.local.y);
    reconcilePosition(state, targetX, targetY, targetDirection, isLocallyMoving, isLocallyTurning, canApplyAuthoritativeDirection);
    if (canApplyAuthoritativeDirection) {
        const directionDelta = Math.abs(targetDirection - state.local.direction);
        const wrappedDirectionDelta = Math.min(directionDelta, 32 - directionDelta);
        if (wrappedDirectionDelta >= 2) {
            logMovementDiag("direction.delta", {
                playerId: state.local.id,
                delta: Number(wrappedDirectionDelta.toFixed(3)),
                localDirection: Number(state.local.direction.toFixed(3)),
                targetDirection: Number(targetDirection.toFixed(3)),
                drift: Number(drift.toFixed(2)),
                isLocallyMoving
            });
        }
    }
};

export const updateFromSnapshot = (
    state: ClientState,
    snapshotPayload: PlayersSnapshotPayload
): void => {
    const snapshot = normalizePlayersSnapshotPayload(snapshotPayload);
    state.remotePlayers.clear();
    const isLocallyMoving = state.controls.moveForward || state.controls.moveBackward;
    const isLocallyTurning = state.controls.turnLeft || state.controls.turnRight;
    const nowMs = Date.now();
    const interpolationDelayMs = isLocallyMoving
        ? LOCAL_SNAPSHOT_INTERPOLATION_DELAY_MOVING_MS
        : LOCAL_SNAPSHOT_INTERPOLATION_DELAY_REST_MS;
    const canApplyAuthoritativeDirection = !isLocallyTurning
        && (state.render.lastLocalTurnInputAt === null
            || (nowMs - state.render.lastLocalTurnInputAt) >= LOCAL_DIRECTION_RECONCILE_HOLDOFF_MS);

    for (const player of snapshot.players) {
        if (player.id === state.local.id) {
            updateLocalSnapshot(state, player, snapshot.serverTime, nowMs, interpolationDelayMs, isLocallyMoving, isLocallyTurning, canApplyAuthoritativeDirection);
            continue;
        }

        const remote: RemotePlayer = {
            ...(player.botRole ? { botRole: player.botRole } : {}),
            id: player.id,
            cloakedUntil: player.cloakedUntil ?? 0, frozenUntil: player.frozenUntil ?? 0,
            city: player.city,
            direction: normalizeDirection32Step(player.direction),
            x: player.offset.x,
            y: player.offset.y
        };

        if (typeof player.health === "number") {
            remote.health = player.health;
        }
        if (typeof player.maxHealth === "number") {
            remote.maxHealth = player.maxHealth;
        }

        state.remotePlayers.set(player.id, remote);
    }
};

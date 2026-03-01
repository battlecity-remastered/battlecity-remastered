import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { BulletState } from "@battlecity/sim-core";
import { resolveCitySpawn } from "../world/city-spawn.js";
import { logMovementDiag } from "./movement-diagnostics.js";

export type LocalState = {
    id: string | null;
    city: number;
    direction: number;
    x: number;
    y: number;
    speed: number;
    health: number;
    maxHealth: number;
    lastShotAt: number;
    lastResearchAt: number;
    lastFactoryCollectAt: number;
    lastHazardAt: number;
    lastItemUseAt: number;
    lastFlareBurstAt: number;
    lastOrbAt: number;
    lastBuildAt: number;
    lastDemolishAt: number;
    lastLobbyLeaveAt: number;
    pendingFlareBurst: boolean;
};

export const LEGACY_PLAYER_SPEED_PX_PER_SECOND = 600;
const DEFAULT_LOBBY_CITY_ID = 0;
const DEFAULT_LOBBY_SPAWN = resolveCitySpawn(DEFAULT_LOBBY_CITY_ID);

export type RemotePlayer = {
    id: string;
    city: number;
    direction: number;
    x: number;
    y: number;
    health?: number;
    maxHealth?: number;
};

type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};

type ClientDefenseState = Mutable<KnownEventPayloadByType["defense.spawn"]>;

export type DebugLatencyStats = {
    samples: number[];
    latest: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
    jitter: number | null;
    updatedAt: number | null;
};

export type DebugSendStats = {
    intervals: number[];
    lastSentAt: number | null;
    hz: number | null;
    avgMs: number | null;
    rejections: number;
    lastRejection: string | null;
    lastRejectionAt: number | null;
};

export type DebugLoopStats = {
    lastUpdateAt: number | null;
    lastRenderAt: number | null;
    renderCount: number;
    updateCount: number;
    lastRenderDeltaMs: number | null;
    updateHz: number | null;
    renderHz: number | null;
    mismatchEvents: number;
};

export type DebugState = {
    socketConnected: boolean;
    lastServerEventAt: number | null;
    latency: DebugLatencyStats;
    send: DebugSendStats;
    loop: DebugLoopStats;
};

export type ClientState = {
    local: LocalState;
    remotePlayers: Map<string, RemotePlayer>;
    lobby: {
        deniedReason: string | null;
        assignments: Array<{
            city: number;
            mayorId?: string;
            recruitCount: number;
        }>;
        highScores: Array<{
            userId: string;
            name: string;
            points: number;
            rankTitle: string;
            orbs?: number;
            assists?: number;
            updatedAt?: number;
        }>;
        lastReleasedPlayerId: string | null;
    };
    cityFinance: Map<number, {
        cash: number;
        income: number;
        score: number;
        researchLevel: number;
        isOrbable?: boolean;
        canBuildStates?: Map<number, number>;
    }>;
    research: Map<number, {
        active?: {
            researchType: number;
            remainingMs: number;
        };
        completed: number[];
    }>;
    factoryStock: Map<number, Map<number, number>>;
    inventory: Map<number, number>;
    hazards: Map<string, {
        id: string;
        cityId: number;
        type: number;
        x: number;
        y: number;
        radius: number;
        armed?: boolean;
        active?: boolean;
    }>;
    bullets: Map<string, BulletState>;
    buildings: Map<string, {
        id: string;
        ownerId: string;
        cityId: number;
        type: number;
        tileX: number;
        tileY: number;
        health: number;
        maxHealth: number;
        population: number;
        attachedHouseId?: string;
    }>;
    defenses: Map<string, ClientDefenseState>;
    scoreProfile: {
        userId: string | null;
        score: number;
        rank: string | null;
    };
    identity: {
        userId: string | null;
        callsign: string;
        provider: "local" | "google";
    };
    chat: {
        history: Array<{
            id: string;
            from: string;
            city: number;
            text: string;
            ts: number;
            scope: "team" | "global";
        }>;
        rateLimitedUntil: number | null;
        rateLimitedScope: "team" | "global" | null;
    };
    events: {
        lastOrbedCityId: number | null;
        lastOrbEvent: {
            sourceCityId: number;
            targetCityId: number;
            by: string;
            awardedScore: number;
            at: number;
        } | null;
        promotions: Array<{
            cityId: number;
            score: number;
            rank: string;
        }>;
        rejectionCount: number;
        lastRejectedReason: string | null;
        lastBuildDeniedReason: string | null;
        lastDemolishDeniedReason: string | null;
        lastPlayerDead: {
            id: string;
            by?: string;
        } | null;
        lastIconPickupConfirmed: {
            playerId: string;
            cityId: number;
            itemType: number;
            amount: number;
        } | null;
        effects: {
            explosions: Array<{
                id: string;
                x: number;
                y: number;
                createdAt: number;
                variant: "small" | "large";
            }>;
            floatingPoints: Array<{
                id: string;
                x: number;
                y: number;
                amount: number;
                createdAt: number;
            }>;
        };
    };
    controls: {
        moveForward: boolean;
        moveBackward: boolean;
        turnLeft: boolean;
        turnRight: boolean;
        shoot: boolean;
        shift: boolean;
        ctrl: boolean;
        build: boolean;
        demolish: boolean;
        useItem: boolean;
        leaveLobby: boolean;
        research: boolean;
        collectFactory: boolean;
        useCloak: boolean;
    };
    world: {
        blockingTiles: Set<string>;
        buildBlockingTiles: Set<string>;
        mapSize: number;
    };
    pointer: {
        x: number;
        y: number;
        inside: boolean;
        surfaceWidth: number;
        surfaceHeight: number;
    };
    render: {
        previousLocalX: number;
        previousLocalY: number;
        projectedOffsetX: number;
        projectedOffsetY: number;
        lastResolvedAt: number | null;
        lastLocalTurnInputAt: number | null;
        authoritativeSnapshots: Array<{
            serverTime: number;
            x: number;
            y: number;
            direction: number;
        }>;
    };
    debug: DebugState;
    ui: {
        showHud: boolean;
        showHelpModal: boolean;
        showMapModal: boolean;
        showOptionsModal: boolean;
        showBuildMenu: boolean;
        buildMenuAnchorX: number;
        buildMenuAnchorY: number;
        buildGhostMode: boolean;
        buildDemolishMode: boolean;
        pendingBuildPlacement: {
            tileX: number;
            tileY: number;
            type: number;
        } | null;
        showIntroModal: boolean;
        showTutorial: boolean;
        selectedBuildType: number;
        selectedInventoryItemType: number | null;
        bombArmed: boolean;
        overlaysOpacity: number;
        audioEnabled: boolean;
        showIdentityPanel: boolean;
        showBotDebug: boolean;
        showBotOverlay: boolean;
        panelView: "status" | "staff" | "city" | "points";
        lobbyView: "assignments" | "scores";
        lobbyCityFilter: number;
        optionsCityImportCity: number;
        optionsCityImportMode: "off" | "preview" | "apply";
        optionsCityImportApplying: boolean;
        optionsCityImportStatus: string | null;
        optionsPerformanceMode: "balanced" | "quality" | "performance";
    };
};

const createLocalDefaults = (): LocalState => ({
    id: null,
    city: DEFAULT_LOBBY_CITY_ID,
    direction: 0,
    x: DEFAULT_LOBBY_SPAWN?.x ?? 128,
    y: DEFAULT_LOBBY_SPAWN?.y ?? 128,
    speed: LEGACY_PLAYER_SPEED_PX_PER_SECOND,
    health: 100,
    maxHealth: 100,
    lastShotAt: 0,
    lastResearchAt: 0,
    lastFactoryCollectAt: 0,
    lastHazardAt: 0,
    lastItemUseAt: 0,
    lastFlareBurstAt: 0,
    lastOrbAt: 0,
    lastBuildAt: 0,
    lastDemolishAt: 0,
    lastLobbyLeaveAt: 0,
    pendingFlareBurst: false
});

const createUiDefaults = (): ClientState["ui"] => ({
    showHud: true,
    showHelpModal: false,
    showMapModal: false,
    showOptionsModal: false,
    showBuildMenu: false,
    buildMenuAnchorX: 56,
    buildMenuAnchorY: 56,
    buildGhostMode: false,
    buildDemolishMode: false,
    pendingBuildPlacement: null,
    showIntroModal: false,
    showTutorial: false,
    selectedBuildType: 300,
    selectedInventoryItemType: null,
    bombArmed: false,
    overlaysOpacity: 0.8,
    audioEnabled: true,
    showIdentityPanel: false,
    showBotDebug: false,
    showBotOverlay: false,
    panelView: "status",
    lobbyView: "assignments",
    lobbyCityFilter: -1,
    optionsCityImportCity: 0,
    optionsCityImportMode: "off",
    optionsCityImportApplying: false,
    optionsCityImportStatus: null,
    optionsPerformanceMode: "balanced"
});

const createDebugDefaults = (): DebugState => ({
    socketConnected: false,
    lastServerEventAt: null,
    latency: {
        samples: [],
        latest: null,
        avg: null,
        min: null,
        max: null,
        jitter: null,
        updatedAt: null
    },
    send: {
        intervals: [],
        lastSentAt: null,
        hz: null,
        avgMs: null,
        rejections: 0,
        lastRejection: null,
        lastRejectionAt: null
    },
    loop: {
        lastUpdateAt: null,
        lastRenderAt: null,
        renderCount: 0,
        updateCount: 0,
        lastRenderDeltaMs: null,
        updateHz: null,
        renderHz: null,
        mismatchEvents: 0
    }
});
export const createClientState = (): ClientState => {
    const local = createLocalDefaults();
    return {
        local,
        remotePlayers: new Map(),
        lobby: {
            deniedReason: null,
            assignments: [],
            highScores: [],
            lastReleasedPlayerId: null
        },
        cityFinance: new Map(),
        research: new Map(),
        factoryStock: new Map(),
        inventory: new Map(),
        hazards: new Map(),
        bullets: new Map(),
        buildings: new Map(),
        defenses: new Map(),
        scoreProfile: {
            userId: null,
            score: 0,
            rank: null
        },
        identity: {
            userId: null,
            callsign: "Pilot",
            provider: "local"
        },
        chat: {
            history: [],
            rateLimitedUntil: null,
            rateLimitedScope: null
        },
        events: {
            lastOrbedCityId: null,
            lastOrbEvent: null,
            promotions: [],
            rejectionCount: 0,
            lastRejectedReason: null,
            lastBuildDeniedReason: null,
            lastDemolishDeniedReason: null,
            lastPlayerDead: null,
            lastIconPickupConfirmed: null,
            effects: {
                explosions: [],
                floatingPoints: []
            }
        },
        controls: {
            moveForward: false,
            moveBackward: false,
            turnLeft: false,
            turnRight: false,
            shoot: false,
            shift: false,
            ctrl: false,
            build: false,
            demolish: false,
            useItem: false,
            leaveLobby: false,
            research: false,
            collectFactory: false,
            useCloak: false
        },
        world: {
            blockingTiles: new Set<string>(),
            buildBlockingTiles: new Set<string>(),
            mapSize: 512
        },
        pointer: {
            x: 0,
            y: 0,
            inside: false,
            surfaceWidth: 0,
            surfaceHeight: 0
        },
        render: {
            previousLocalX: local.x,
            previousLocalY: local.y,
            projectedOffsetX: 0,
            projectedOffsetY: 0,
            lastResolvedAt: null,
            lastLocalTurnInputAt: null,
            authoritativeSnapshots: []
        },
        debug: createDebugDefaults(),
        ui: createUiDefaults()
    };
};

// Server authority plus WAN latency causes small drift; soften correction to avoid visible jitter.
const LOCAL_SNAPSHOT_SOFT_RECONCILE_DISTANCE_PX = 22;
const LOCAL_SNAPSHOT_HARD_RECONCILE_DISTANCE_PX = 84;
const LOCAL_SNAPSHOT_SOFT_RECONCILE_GAIN = 0.231;
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
    interpolationDelayMs: number
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
    const extrapolationMs = Math.max(0, Math.min(
        LOCAL_SNAPSHOT_MAX_EXTRAPOLATION_MS,
        targetTime - latest.serverTime
    ));
    return {
        x: latest.x + (vx * extrapolationMs),
        y: latest.y + (vy * extrapolationMs),
        direction: latest.direction
    };
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
            pushAuthoritativeSnapshot(state, snapshot.serverTime, player);
            const authoritative = resolveAuthoritativeTarget(state, nowMs, interpolationDelayMs);
            state.local.city = player.city;
            if (canApplyAuthoritativeDirection) {
                state.local.direction = authoritative?.direction ?? player.direction;
            }
            const targetX = authoritative?.x ?? player.offset.x;
            const targetY = authoritative?.y ?? player.offset.y;
            const targetDirection = canApplyAuthoritativeDirection
                ? (authoritative?.direction ?? player.direction)
                : state.local.direction;
            const dx = targetX - state.local.x;
            const dy = targetY - state.local.y;
            const driftSq = (dx * dx) + (dy * dy);
            const drift = Math.sqrt(driftSq);
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
            state.local.speed = LEGACY_PLAYER_SPEED_PX_PER_SECOND;
            if (typeof player.health === "number") {
                state.local.health = player.health;
            }
            if (typeof player.maxHealth === "number") {
                state.local.maxHealth = player.maxHealth;
            }
            continue;
        }

        const remote: RemotePlayer = {
            id: player.id,
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

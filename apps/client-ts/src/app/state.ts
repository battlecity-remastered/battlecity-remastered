import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { BulletState } from "@battlecity/sim-core";
import { resolveCitySpawn } from "../world/city-spawn.js";

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
            lastResolvedAt: null
        },
        debug: createDebugDefaults(),
        ui: createUiDefaults()
    };
};

// Server authority plus WAN latency causes small drift; soften correction to avoid visible jitter.
const LOCAL_SNAPSHOT_SOFT_RECONCILE_DISTANCE_PX = 12;
const LOCAL_SNAPSHOT_HARD_RECONCILE_DISTANCE_PX = 72;
const LOCAL_SNAPSHOT_SOFT_RECONCILE_GAIN = 0.35;
const LOCAL_SNAPSHOT_MOVING_RECONCILE_DISTANCE_PX = 40;

export const updateFromSnapshot = (
    state: ClientState,
    snapshot: ReadonlyArray<{
        id: string;
        city: number;
        direction: number;
        offset: { x: number; y: number };
        health?: number | undefined;
        maxHealth?: number | undefined;
    }>
): void => {
    state.remotePlayers.clear();
    const isLocallyMoving = state.controls.moveForward || state.controls.moveBackward;
    const isLocallyTurning = state.controls.turnLeft || state.controls.turnRight;

    for (const player of snapshot) {
        if (player.id === state.local.id) {
            state.local.city = player.city;
            if (!isLocallyTurning) {
                state.local.direction = player.direction;
            }
            const dx = player.offset.x - state.local.x;
            const dy = player.offset.y - state.local.y;
            const driftSq = (dx * dx) + (dy * dy);
            if (driftSq > (LOCAL_SNAPSHOT_HARD_RECONCILE_DISTANCE_PX ** 2)) {
                state.local.x = player.offset.x;
                state.local.y = player.offset.y;
                state.local.direction = player.direction;
                state.render.previousLocalX = player.offset.x;
                state.render.previousLocalY = player.offset.y;
                state.render.projectedOffsetX = 0;
                state.render.projectedOffsetY = 0;
                state.render.lastResolvedAt = null;
            } else if (
                isLocallyMoving
                && driftSq > (LOCAL_SNAPSHOT_MOVING_RECONCILE_DISTANCE_PX ** 2)
            ) {
                // While moving on higher-latency links, avoid tiny snap-back corrections.
                state.local.x += dx * 0.2;
                state.local.y += dy * 0.2;
            } else if (!isLocallyMoving && driftSq > (LOCAL_SNAPSHOT_SOFT_RECONCILE_DISTANCE_PX ** 2)) {
                state.local.x += dx * LOCAL_SNAPSHOT_SOFT_RECONCILE_GAIN;
                state.local.y += dy * LOCAL_SNAPSHOT_SOFT_RECONCILE_GAIN;
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
            direction: player.direction,
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

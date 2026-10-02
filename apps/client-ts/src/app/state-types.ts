import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { BulletState, TankMovementInput } from "@battlecity/sim-core";

export type LocalState = {
    cloakedUntil?: number;
    frozenUntil?: number;
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

export type RemotePlayer = {
    botRole?: "mayor" | "shooter" | "bomb_defuser" | "miner";
    cloakedUntil?: number;
    frozenUntil?: number;
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
    renderIntervalsMs: number[];
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
        fuseEndsAt?: number;
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
        authToken?: string;
        authExpiresAt?: number;
        authPending?: boolean;
        userId: string | null;
        callsign: string;
        provider: "local" | "google";
    };
    movement: {
        nextSeq: number;
        lastAck: number;
        lastSentSeq: number;
        pending: TankMovementInput[];
        pendingMs: number;
        retryAt: number;
        serverClippedMs: number;
        visualOffsetX: number;
        visualOffsetY: number;
        correctionPx: number;
        maxCorrectionPx: number;
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
        showPopulationLinks: boolean;
        selectedPopulationHouseId: string | null;
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

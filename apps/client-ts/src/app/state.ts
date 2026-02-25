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
    bullets: Map<string, {
        id: string;
        ownerId: string;
        city: number;
        x: number;
        y: number;
        direction: number;
        speed: number;
        type: number;
    }>;
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
    defenses: Map<string, {
        id: string;
        cityId: number;
        type: number;
        tileX: number;
        tileY: number;
        health: number;
        maxHealth: number;
        orientation?: number;
    }>;
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
    panelView: "status",
    lobbyView: "assignments",
    lobbyCityFilter: -1,
    optionsCityImportCity: 0,
    optionsCityImportMode: "off",
    optionsCityImportApplying: false,
    optionsCityImportStatus: null,
    optionsPerformanceMode: "balanced"
});
export const createClientState = (): ClientState => {
    return {
        local: createLocalDefaults(),
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
            rateLimitedUntil: null
        },
        events: {
            lastOrbedCityId: null,
            lastOrbEvent: null,
            promotions: [],
            rejectionCount: 0,
            lastRejectedReason: null,
            lastBuildDeniedReason: null,
            lastDemolishDeniedReason: null,
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
        ui: createUiDefaults()
    };
};

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

    for (const player of snapshot) {
        if (player.id === state.local.id) {
            state.local.city = player.city;
            state.local.direction = player.direction;
            state.local.x = player.offset.x;
            state.local.y = player.offset.y;
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

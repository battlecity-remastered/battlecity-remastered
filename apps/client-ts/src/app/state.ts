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
    lastOrbAt: number;
    lastLobbyLeaveAt: number;
    placedInitialBuilding: boolean;
};

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
        lastReleasedPlayerId: string | null;
    };
    cityFinance: Map<number, {
        cash: number;
        income: number;
        score: number;
        researchLevel: number;
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
    }>;
    bullets: Map<string, {
        id: string;
        ownerId: string;
        city: number;
        x: number;
        y: number;
        direction: number;
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
    }>;
    scoreProfile: {
        userId: string | null;
        score: number;
        rank: string | null;
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
    };
    controls: {
        moveForward: boolean;
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
        overlaysOpacity: number;
    };
};

export const createClientState = (): ClientState => {
    return {
        local: {
            id: null,
            city: 0,
            direction: 0,
            x: 128,
            y: 128,
            speed: 300,
            health: 100,
            maxHealth: 100,
            lastShotAt: 0,
            lastResearchAt: 0,
            lastFactoryCollectAt: 0,
            lastHazardAt: 0,
            lastItemUseAt: 0,
            lastOrbAt: 0,
            lastLobbyLeaveAt: 0,
            placedInitialBuilding: false
        },
        remotePlayers: new Map(),
        lobby: {
            deniedReason: null,
            assignments: [],
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
        chat: {
            history: [],
            rateLimitedUntil: null
        },
        events: {
            lastOrbedCityId: null,
            promotions: [],
            rejectionCount: 0,
            lastRejectedReason: null,
            lastBuildDeniedReason: null,
            lastDemolishDeniedReason: null,
            lastIconPickupConfirmed: null
        },
        controls: {
            moveForward: false,
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
            collectFactory: false
        },
        pointer: {
            x: 0,
            y: 0,
            inside: false,
            surfaceWidth: 0,
            surfaceHeight: 0
        },
        ui: {
            showHud: true,
            showHelpModal: false,
            showMapModal: false,
            showOptionsModal: false,
            overlaysOpacity: 0.66
        }
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
            state.local.x = player.offset.x;
            state.local.y = player.offset.y;
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

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
    hazards: Map<string, {
        id: string;
        cityId: number;
        type: number;
        x: number;
        y: number;
        radius: number;
    }>;
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
        lastBuildDeniedReason: string | null;
        lastDemolishDeniedReason: string | null;
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
        hazards: new Map(),
        chat: {
            history: [],
            rateLimitedUntil: null
        },
        events: {
            lastOrbedCityId: null,
            promotions: [],
            lastBuildDeniedReason: null,
            lastDemolishDeniedReason: null
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

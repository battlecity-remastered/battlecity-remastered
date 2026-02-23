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
    controls: {
        moveForward: boolean;
        turnLeft: boolean;
        turnRight: boolean;
        shoot: boolean;
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
            placedInitialBuilding: false
        },
        remotePlayers: new Map(),
        lobby: {
            deniedReason: null,
            assignments: [],
            lastReleasedPlayerId: null
        },
        controls: {
            moveForward: false,
            turnLeft: false,
            turnRight: false,
            shoot: false
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

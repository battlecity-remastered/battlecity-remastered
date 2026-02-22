import type { BulletState, CombatBuildingState, PlayerState } from "@battlecity/sim-core";

export type RuntimePlayer = PlayerState & {
    city: number;
    health: number;
    maxHealth: number;
};

export type RuntimeBuilding = CombatBuildingState & {
    ownerId: string;
    type: number;
};

export type RuntimeState = {
    players: Map<string, RuntimePlayer>;
    bullets: Map<string, BulletState>;
    buildings: Map<string, RuntimeBuilding>;
    socketCities: Map<string, number>;
    socketRoles: Map<string, "mayor" | "recruit">;
    seq: number;
};

export type RuntimeConfig = {
    defaultCity: number;
    mapMax: number;
    serverStepMs: number;
    bulletTickMs: number;
    defaultBuildingHealth: number;
    playerSpeed: number;
    bulletSpeed: number;
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
    defaultCity: 0,
    mapMax: 24576,
    serverStepMs: 33,
    bulletTickMs: 100,
    defaultBuildingHealth: 120,
    playerSpeed: 300,
    bulletSpeed: 900
};

export const createRuntimeState = (): RuntimeState => {
    return {
        players: new Map(),
        bullets: new Map(),
        buildings: new Map(),
        socketCities: new Map(),
        socketRoles: new Map(),
        seq: 0
    };
};

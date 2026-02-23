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

export type RuntimeCity = {
    cityId: number;
    cash: number;
    income: number;
    score: number;
    researchLevel: number;
    orbCount: number;
};

export type RuntimeResearchState = {
    active?: {
        researchType: number;
        remainingMs: number;
    };
    completed: number[];
};

export type RuntimeHazard = {
    id: string;
    cityId: number;
    type: number;
    x: number;
    y: number;
    radius: number;
    damage: number;
    remainingMs: number;
};

export type RuntimeChatMessage = {
    id: string;
    from: string;
    city: number;
    text: string;
    ts: number;
    scope: "team" | "global";
};

export type RuntimeState = {
    players: Map<string, RuntimePlayer>;
    bullets: Map<string, BulletState>;
    buildings: Map<string, RuntimeBuilding>;
    cities: Map<number, RuntimeCity>;
    research: Map<number, RuntimeResearchState>;
    factoryStock: Map<number, Map<number, number>>;
    hazards: Map<string, RuntimeHazard>;
    playerInventory: Map<string, Map<number, number>>;
    socketCities: Map<string, number>;
    socketRoles: Map<string, "mayor" | "recruit">;
    chatHistory: RuntimeChatMessage[];
    chatRateLimit: Map<string, { team: number[]; global: number[] }>;
    economyTickAccumulatorMs: number;
    factoryTickAccumulatorMs: number;
    seq: number;
};

export type RuntimeConfig = {
    defaultCity: number;
    cityCount: number;
    maxRecruitsPerCity: number;
    mapMax: number;
    serverStepMs: number;
    bulletTickMs: number;
    defaultBuildingHealth: number;
    playerSpeed: number;
    bulletSpeed: number;
    maxPlayerUpdateDistancePerTick: number;
    cityStartingCash: number;
    cityBaseIncome: number;
    researchCost: number;
    researchDurationMs: number;
    buildingCost: number;
    maxBuildingChainDistanceTiles: number;
    factoryProductionTickMs: number;
    factoryStockCap: number;
    hazardDefaultFuseMs: number;
    hazardDefaultRadius: number;
    hazardDefaultDamage: number;
    orbScoreAward: number;
    chatHistoryLimit: number;
    inventoryPerItemCap: number;
    hospitalBuildingType: number;
    hospitalHealPerTick: number;
};

export type RuntimeRejectReason =
    | "invalid_envelope"
    | "player_not_joined"
    | "city_mismatch"
    | "building_not_found"
    | "owner_mismatch"
    | "lobby_full"
    | "invalid_player_update"
    | "insufficient_funds"
    | "research_active"
    | "research_unavailable"
    | "factory_empty"
    | "hazard_invalid"
    | "orb_invalid"
    | "chat_rate_limited"
    | "inventory_empty"
    | "not_mayor"
    | "building_collision"
    | "build_too_far"
    | "research_required";

export type CommandResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: RuntimeRejectReason };

export const okResult = <T>(value: T): CommandResult<T> => {
    return { ok: true, value };
};

export const rejectResult = (reason: RuntimeRejectReason): CommandResult<never> => {
    return { ok: false, reason };
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
    defaultCity: 0,
    cityCount: 8,
    maxRecruitsPerCity: 7,
    mapMax: 24576,
    serverStepMs: 33,
    bulletTickMs: 100,
    defaultBuildingHealth: 120,
    playerSpeed: 300,
    bulletSpeed: 900,
    maxPlayerUpdateDistancePerTick: 80,
    cityStartingCash: 200,
    cityBaseIncome: 15,
    researchCost: 100,
    researchDurationMs: 3000,
    buildingCost: 150,
    maxBuildingChainDistanceTiles: 20,
    factoryProductionTickMs: 1000,
    factoryStockCap: 8,
    hazardDefaultFuseMs: 2000,
    hazardDefaultRadius: 96,
    hazardDefaultDamage: 35,
    orbScoreAward: 250,
    chatHistoryLimit: 50,
    inventoryPerItemCap: 5,
    hospitalBuildingType: 300,
    hospitalHealPerTick: 2
};

export const createRuntimeState = (): RuntimeState => {
    return {
        players: new Map(),
        bullets: new Map(),
        buildings: new Map(),
        cities: new Map(),
        research: new Map(),
        factoryStock: new Map(),
        hazards: new Map(),
        playerInventory: new Map(),
        socketCities: new Map(),
        socketRoles: new Map(),
        chatHistory: [],
        chatRateLimit: new Map(),
        economyTickAccumulatorMs: 0,
        factoryTickAccumulatorMs: 0,
        seq: 0
    };
};

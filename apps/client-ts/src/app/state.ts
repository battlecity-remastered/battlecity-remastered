import { CLASSIC_TANK_HEALTH } from "@battlecity/sim-core";
import { resolveCitySpawn } from "../world/city-spawn.js";
import { createMovementState } from "./movement-state.js";
import type { ClientState, DebugState, LocalState } from "./state-types.js";
export { LEGACY_PLAYER_SPEED_PX_PER_SECOND } from "./player-constants.js";
export { updateFromSnapshot } from "./snapshot-reconciliation.js";
export type * from "./state-types.js";

import { LEGACY_PLAYER_SPEED_PX_PER_SECOND } from "./player-constants.js";
const DEFAULT_LOBBY_CITY_ID = 0;
const DEFAULT_LOBBY_SPAWN = resolveCitySpawn(DEFAULT_LOBBY_CITY_ID);

export const isThreeDemoMode = (): boolean => typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demo") === "1";

const createLocalDefaults = (): LocalState => ({
    id: isThreeDemoMode() ? "local-three-demo" : null,
    city: DEFAULT_LOBBY_CITY_ID,
    direction: 0,
    x: DEFAULT_LOBBY_SPAWN?.x ?? 128,
    y: DEFAULT_LOBBY_SPAWN?.y ?? 128,
    speed: LEGACY_PLAYER_SPEED_PX_PER_SECOND,
    health: CLASSIC_TANK_HEALTH,
    maxHealth: CLASSIC_TANK_HEALTH,
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
    showPopulationLinks: false,
    selectedPopulationHouseId: null,
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
        renderIntervalsMs: [],
        mismatchEvents: 0
    }
});
const createRenderDefaults = (local: LocalState): ClientState["render"] => ({
    previousLocalX: local.x,
    previousLocalY: local.y,
    projectedOffsetX: 0,
    projectedOffsetY: 0,
    lastResolvedAt: null,
    lastLocalTurnInputAt: null,
    authoritativeSnapshots: []
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
        movement: createMovementState(),
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
        render: createRenderDefaults(local),
        debug: createDebugDefaults(),
        ui: createUiDefaults()
    };
};

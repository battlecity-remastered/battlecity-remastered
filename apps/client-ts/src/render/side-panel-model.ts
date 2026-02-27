import type { ClientState } from "../app/state.js";
import { getCityDisplayName } from "../world/city-spawn.js";
import { ITEM_TYPE_BOMB, ITEM_TYPE_ORB } from "./parity/constants.js";

const ORB_PANEL_FRAME_COUNT = 3;
const ORB_PANEL_FRAME_INTERVAL_MS = 200;

export const resolvePanelItemFrameRect = (
    itemType: number,
    nowMs: number,
    bombArmed: boolean
): { x: number; y: number; width: number; height: number } => {
    if (itemType === ITEM_TYPE_ORB) {
        const frame = Math.floor((nowMs % (ORB_PANEL_FRAME_COUNT * ORB_PANEL_FRAME_INTERVAL_MS)) / ORB_PANEL_FRAME_INTERVAL_MS);
        return {
            x: 250,
            y: 41 + (Math.max(0, Math.min(ORB_PANEL_FRAME_COUNT - 1, frame)) * 48),
            width: 32,
            height: 32
        };
    }
    if (itemType === ITEM_TYPE_BOMB && bombArmed) {
        return {
            x: 152,
            y: 89,
            width: 32,
            height: 32
        };
    }
    return {
        x: itemType * 32,
        y: 0,
        width: 32,
        height: 32
    };
};

const resolveStaffPanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const assignments = state.lobby.assignments;
    const city = assignments.find((entry) => entry.city === state.local.city);
    return {
        heading: "Staff",
        lines: [
            `Mayor: ${city?.mayorId ? "Online" : "Vacant"}`,
            `Recruits: ${city?.recruitCount ?? 0}`,
            `Players: ${state.remotePlayers.size + (state.local.id ? 1 : 0)}`
        ]
    };
};

const countCityEntities = <T extends { cityId: number; }>(
    values: Iterable<T>,
    cityId: number
): number => {
    let total = 0;
    for (const value of values) {
        if (value.cityId === cityId) {
            total += 1;
        }
    }
    return total;
};

const resolveCityPanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const cityId = state.local.city;
    const buildings = countCityEntities(state.buildings.values(), cityId);
    const defenses = countCityEntities(state.defenses.values(), cityId);
    const hazards = countCityEntities(state.hazards.values(), cityId);
    return {
        heading: getCityDisplayName(cityId),
        lines: [
            `Buildings: ${buildings}`,
            `Defenses: ${defenses}`,
            `Hazards: ${hazards}`
        ]
    };
};

const resolvePointsPanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const lastPromotion = state.events.promotions.at(-1);
    return {
        heading: "Points",
        lines: [
            `Score: ${state.scoreProfile.score}`,
            `Rank: ${state.scoreProfile.rank ?? "-"}`,
            `Last promo: ${lastPromotion?.rank ?? "-"}`
        ]
    };
};

const resolveDefaultPanelMessage = (): { heading: string; lines: string[] } => {
    return {
        heading: "Intel",
        lines: ["Right-click a city building to inspect."]
    };
};

const PANEL_MESSAGE_RESOLVERS: Readonly<Record<ClientState["ui"]["panelView"], (state: ClientState) => { heading: string; lines: string[] }>> = {
    staff: resolveStaffPanelMessage,
    city: resolveCityPanelMessage,
    points: resolvePointsPanelMessage,
    status: resolveDefaultPanelMessage
};

export const resolvePanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const resolver = PANEL_MESSAGE_RESOLVERS[state.ui.panelView];
    return resolver ? resolver(state) : resolveDefaultPanelMessage();
};

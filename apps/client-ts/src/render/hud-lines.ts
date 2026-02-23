import type { ClientState } from "../app/state.js";

const readFinance = (state: ClientState): { cash: string; income: string } => {
    const finance = state.cityFinance.get(state.local.city);
    if (!finance) {
        return { cash: "-", income: "-" };
    }
    return {
        cash: String(finance.cash),
        income: String(finance.income)
    };
};

const readResearch = (state: ClientState): string => {
    const research = state.research.get(state.local.city);
    if (!research) {
        return "0";
    }
    const completed = String(research.completed.length);
    if (!research.active) {
        return completed;
    }
    return `${completed} (active)`;
};

const readFactoryStock = (state: ClientState): number => {
    return state.factoryStock.get(state.local.city)?.get(0) ?? 0;
};

const readCityPopulation = (state: ClientState): number => {
    let total = 0;
    for (const building of state.buildings.values()) {
        if (building.cityId !== state.local.city) {
            continue;
        }
        total += building.population;
    }
    return total;
};

const buildHudIdentityLines = (state: ClientState): string[] => {
    return [
        `id: ${state.local.id ?? "(joining...)"}`,
        `user: ${state.scoreProfile.userId ?? "-"}`,
        `city: ${state.local.city}`,
        `rank: ${state.scoreProfile.rank ?? "-"} (${state.scoreProfile.score})`,
        `health: ${state.local.health}/${state.local.maxHealth}`,
        `remote: ${state.remotePlayers.size}`
    ];
};

const buildHudWorldLines = (
    state: ClientState,
    finance: { cash: string; income: string },
    researchLine: string
): string[] => {
    return [
        `cash: ${finance.cash}`,
        `income: ${finance.income}`,
        `research: ${researchLine}`,
        `population: ${readCityPopulation(state)}`,
        `factory item0: ${readFactoryStock(state)}`,
        `medkits: ${state.inventory.get(0) ?? 0}`,
        `hazards: ${state.hazards.size}`,
        `bullets: ${state.bullets.size}`,
        `defenses: ${state.defenses.size}`,
        `chat: ${state.chat.history.length}`
    ];
};

const buildHudEventLines = (state: ClientState): string[] => {
    const lastIconPickup = state.events.lastIconPickupConfirmed;
    const lastPickupLine = lastIconPickup
        ? `${lastIconPickup.itemType} x${lastIconPickup.amount}`
        : "-";
    return [
        `last pickup: ${lastPickupLine}`,
        `rejections: ${state.events.rejectionCount} (${state.events.lastRejectedReason ?? "-"})`,
        `build denied: ${state.events.lastBuildDeniedReason ?? "-"}`,
        `demolish denied: ${state.events.lastDemolishDeniedReason ?? "-"}`
    ];
};

export const buildHudLines = (state: ClientState): string[] => {
    const finance = readFinance(state);
    const researchLine = readResearch(state);
    return [
        ...buildHudIdentityLines(state),
        ...buildHudWorldLines(state, finance, researchLine),
        ...buildHudEventLines(state),
        `pointer: ${Math.round(state.pointer.x)},${Math.round(state.pointer.y)} (${state.pointer.inside ? "in" : "out"})`,
        "controls: W/Up move, A/D turn, Space fire, R research, C pickup, U medkit, X hazard, B orb, Shift+B defense"
    ];
};

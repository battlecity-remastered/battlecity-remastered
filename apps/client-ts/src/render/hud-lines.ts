import type { ClientState } from "../app/state.js";
import { buildInventoryHudLines } from "../gameplay/items/IconInventoryService.js";
import { summarizeRogueTanks } from "../gameplay/rogue/RogueTankService.js";
import { summarizeDefenderState } from "../gameplay/defenders/DefenderDebugService.js";

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
    const role = state.lobby.assignments
        .find((entry) => entry.city === state.local.city)
        ?.mayorId === state.local.id
        ? "mayor"
        : "recruit";
    return [
        `Player ${state.local.id ?? "(joining...)"}`,
        `City ${state.local.city} ${role}  HP ${state.local.health}/${state.local.maxHealth}`,
        `Rank ${state.scoreProfile.rank ?? "-"} (${state.scoreProfile.score})`
    ];
};

const buildHudWorldLines = (
    state: ClientState,
    finance: { cash: string; income: string },
    researchLine: string
): string[] => {
    return [
        `Cash ${finance.cash}  Income ${finance.income}  Research ${researchLine}`,
        `Pop ${readCityPopulation(state)}  Factory ${readFactoryStock(state)}  Medkits ${state.inventory.get(0) ?? 0}`,
        `Hazards ${state.hazards.size}  Bullets ${state.bullets.size}  Defenses ${state.defenses.size}`
    ];
};

const buildHudEventLines = (state: ClientState): string[] => {
    const lastIconPickup = state.events.lastIconPickupConfirmed;
    if (!lastIconPickup && !state.events.lastBuildDeniedReason && !state.events.lastDemolishDeniedReason) {
        return [];
    }
    const lines: string[] = [];
    if (lastIconPickup) {
        lines.push(`Last pickup ${lastIconPickup.itemType} x${lastIconPickup.amount}`);
    }
    if (state.events.lastBuildDeniedReason) {
        lines.push(`Build denied: ${state.events.lastBuildDeniedReason}`);
    }
    if (state.events.lastDemolishDeniedReason) {
        lines.push(`Demolish denied: ${state.events.lastDemolishDeniedReason}`);
    }
    return lines;
};

export const buildHudLines = (state: ClientState): string[] => {
    const finance = readFinance(state);
    const researchLine = readResearch(state);
    const base = [
        ...buildHudIdentityLines(state),
        ...buildHudWorldLines(state, finance, researchLine),
        `Inventory ${buildInventoryHudLines(state).join(" | ")}`,
    ];
    const events = buildHudEventLines(state);
    if (!state.ui.showBotDebug) {
        return [...base, ...events];
    }
    const rogue = summarizeRogueTanks(state);
    const defenders = summarizeDefenderState(state);
    return [
        ...base,
        `Hostiles ${rogue.hostilePlayers} nearest ${rogue.nearestDistance === null ? "-" : Math.round(rogue.nearestDistance)}  Defense damage ${defenders.damagedDefenses}/${defenders.defenseCount}`,
        ...events,
        "W/Up forward | S/Down reverse | Left/Right turn | Shift/Space fire | Ctrl+B build | Ctrl+X demolish | R research | U pickup | H/C use | D drop | B orb"
    ];
};

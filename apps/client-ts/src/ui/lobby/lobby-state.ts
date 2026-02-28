import type { ClientState } from "../../app/state.js";
import { getCityDisplayName } from "../../world/city-spawn.js";

const MAX_ASSIGNMENTS = 8;
export const MAX_RECRUITS_PER_CITY = 3;
const DEFAULT_LOBBY_CITY_COUNT = 8;

export const collectVisibleCities = (state: ClientState): number[] => {
    const cities = new Set<number>();
    for (let cityId = 0; cityId < DEFAULT_LOBBY_CITY_COUNT; cityId += 1) {
        cities.add(cityId);
    }
    for (const assignment of state.lobby.assignments) {
        cities.add(assignment.city);
    }
    for (const city of state.cityFinance.keys()) {
        cities.add(city);
    }
    return Array.from(cities.values()).sort((a, b) => a - b);
};

export const resolveFilterLabel = (state: ClientState): string => {
    if (state.ui.lobbyCityFilter < 0) {
        return "all";
    }
    const city = state.ui.lobbyCityFilter;
    return getCityDisplayName(city);
};

export const buildAssignmentSignature = (state: ClientState): string => {
    return state.lobby.assignments
        .map((entry) => `${entry.city}:${entry.mayorId ?? "-"}:${entry.recruitCount}`)
        .join("|");
};

export const buildFinanceSignature = (state: ClientState): string => {
    return Array.from(state.cityFinance.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([city, finance]) => `${city}:${finance.score}:${finance.cash}:${finance.income}:${finance.researchLevel}`)
        .join("|");
};

export const buildHighScoresSignature = (state: ClientState): string => {
    return state.lobby.highScores
        .map((entry) => {
            return `${entry.userId}:${entry.name}:${entry.points}:${entry.rankTitle}:${entry.orbs ?? 0}:${entry.assists ?? 0}:${entry.updatedAt ?? 0}`;
        })
        .join("|");
};

export const applyLobbyAction = (state: ClientState, key: string): boolean => {
    if (key === "Tab") {
        state.ui.lobbyView = state.ui.lobbyView === "assignments" ? "scores" : "assignments";
        return true;
    }
    if (key === "Home") {
        state.ui.lobbyCityFilter = -1;
        return true;
    }
    if (key !== "PageUp" && key !== "PageDown") {
        return false;
    }
    const cities = collectVisibleCities(state);
    if (cities.length === 0) {
        state.ui.lobbyCityFilter = -1;
        return true;
    }
    const sequence = [-1, ...cities];
    const currentIndex = Math.max(0, sequence.indexOf(state.ui.lobbyCityFilter));
    const offset = key === "PageDown" ? 1 : -1;
    const nextIndex = (currentIndex + offset + sequence.length) % sequence.length;
    state.ui.lobbyCityFilter = sequence[nextIndex] ?? -1;
    return true;
};

export const buildLobbyLines = (state: ClientState): string[] => {
    const baseLines = buildLobbyBaseLines(state);
    if (state.ui.lobbyView === "scores") {
        return [...baseLines, ...buildLobbyScoreLines(state)];
    }
    return [...baseLines, ...buildLobbyAssignmentLines(state)];
};

const buildLobbyBaseLines = (state: ClientState): string[] => {
    const cityLabel = getCityDisplayName(state.local.city);
    const header = `${cityLabel} lobby  ${state.local.id ?? "pending"}`;
    const tabs = state.ui.lobbyView === "assignments"
        ? "Tabs: [Assignments*] [Scores]"
        : "Tabs: [Assignments] [Scores*]";
    const mode = `View: ${state.ui.lobbyView}  Filter: ${resolveFilterLabel(state)} (Tab/PgUp/PgDn/Home)`;
    const denied = state.lobby.deniedReason ? `Denied: ${state.lobby.deniedReason}` : "Denied: -";
    const released = state.lobby.lastReleasedPlayerId
        ? `Released: ${state.lobby.lastReleasedPlayerId}`
        : "Released: -";
    return [header, tabs, mode, denied, released];
};

const buildLobbyScoreLines = (state: ClientState): string[] => {
    const ranked = [...state.lobby.highScores]
        .sort((a, b) => {
            const scoreDiff = b.points - a.points;
            if (scoreDiff !== 0) {
                return scoreDiff;
            }
            return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
        })
        .slice(0, MAX_ASSIGNMENTS)
        .map((entry, index) => {
            const orbs = Number.isFinite(entry.orbs) ? ` orbs ${entry.orbs}` : "";
            const assists = Number.isFinite(entry.assists) ? ` assists ${entry.assists}` : "";
            return `#${index + 1} ${entry.name}: ${entry.points} pts (${entry.rankTitle})${orbs}${assists}`;
        });
    if (ranked.length === 0) {
        return ["No player scores yet."];
    }
    return ranked;
};

const buildLobbyAssignmentLines = (state: ClientState): string[] => {
    const assignments = state.lobby.assignments
        .filter((entry) => state.ui.lobbyCityFilter < 0 || state.ui.lobbyCityFilter === entry.city)
        .slice(0, MAX_ASSIGNMENTS)
        .map((entry) => {
            const mayor = entry.mayorId ?? "-";
            const label = getCityDisplayName(entry.city);
            return `${label}: mayor ${mayor} recruits ${entry.recruitCount}`;
        });
    if (assignments.length === 0) {
        return ["No active assignments"];
    }
    return assignments;
};

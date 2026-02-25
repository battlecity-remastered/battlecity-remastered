import type { ClientState } from "../../app/state.js";
import { getCityDisplayName } from "../../world/city-spawn.js";
import { MAX_RECRUITS_PER_CITY, collectVisibleCities } from "./lobby-state.js";

export type LobbyCityListRenderOptions = {
    state: ClientState;
    cityList: HTMLElement;
    cityFilter: string;
    waiting: boolean;
    waitingCity: number | null;
    requestJoin: (cityId: number) => void;
};

const matchesLobbyCityFilter = (
    cityId: number,
    state: ClientState,
    filterText: string
): boolean => {
    if (state.ui.lobbyCityFilter >= 0 && state.ui.lobbyCityFilter !== cityId) {
        return false;
    }
    if (filterText.length === 0) {
        return true;
    }
    const label = `${getCityDisplayName(cityId)} c${cityId}`.toLowerCase();
    return label.includes(filterText);
};

const collectFilteredLobbyCities = (
    cityIds: number[],
    state: ClientState,
    cityFilter: string
): number[] => {
    const filterText = cityFilter.trim().toLowerCase();
    return cityIds.filter((cityId) => matchesLobbyCityFilter(cityId, state, filterText));
};

const renderEmptyLobbyCityList = (cityList: HTMLElement, cityIds: number[]): void => {
    const empty = document.createElement("div");
    empty.className = "lobby-city-empty";
    empty.textContent = cityIds.length === 0
        ? "Waiting for city assignments..."
        : "No cities match that filter.";
    cityList.appendChild(empty);
};

type LobbyCityRowModel = {
    cityId: number;
    mayorId: string | null;
    players: number;
    canJoin: boolean;
    hasMayorSlot: boolean;
    hasRecruitSlot: boolean;
    financeScore: number | null;
    waiting: boolean;
};

const buildLobbyCityRowModel = (
    state: ClientState,
    cityId: number,
    waiting: boolean,
    waitingCity: number | null
): LobbyCityRowModel => {
    const assignment = state.lobby.assignments.find((entry) => entry.city === cityId);
    const finance = state.cityFinance.get(cityId);
    const mayorId = assignment?.mayorId ?? null;
    const recruitCount = assignment?.recruitCount ?? 0;
    const players = (mayorId ? 1 : 0) + recruitCount;
    const hasMayorSlot = mayorId === null;
    const hasRecruitSlot = recruitCount < MAX_RECRUITS_PER_CITY;
    return {
        cityId,
        mayorId,
        players,
        canJoin: hasMayorSlot || hasRecruitSlot,
        hasMayorSlot,
        hasRecruitSlot,
        financeScore: finance?.score ?? null,
        waiting: waiting && waitingCity === cityId
    };
};

const buildLobbyCityMetaText = (model: LobbyCityRowModel): string => {
    const mayorLabel = model.mayorId ? model.mayorId : "(open)";
    const parts = [
        `Mayor: ${mayorLabel}`,
        `Players: ${model.players}/${1 + MAX_RECRUITS_PER_CITY}`
    ];
    if (model.financeScore !== null) {
        parts.push(`Score: ${model.financeScore}`);
    }
    return parts.join(" • ");
};

const buildLobbyJoinButtonLabel = (model: LobbyCityRowModel): string => {
    if (model.hasMayorSlot) {
        return "Join Mayor";
    }
    if (model.hasRecruitSlot) {
        return "Join Recruit";
    }
    return "Full";
};

const createLobbyCityRow = (
    model: LobbyCityRowModel,
    waiting: boolean,
    requestJoin: (cityId: number) => void
): HTMLElement => {
    const row = document.createElement("div");
    row.className = "lobby-city-row";
    if (model.waiting) {
        row.classList.add("waiting");
    }

    const info = document.createElement("div");
    info.className = "lobby-city-info";

    const name = document.createElement("div");
    name.className = "lobby-city-name";
    name.textContent = getCityDisplayName(model.cityId);

    const meta = document.createElement("div");
    meta.className = "lobby-city-meta";
    meta.textContent = buildLobbyCityMetaText(model);
    info.appendChild(name);
    info.appendChild(meta);

    const cityActions = document.createElement("div");
    cityActions.className = "lobby-city-actions";

    const joinButton = document.createElement("button");
    joinButton.type = "button";
    joinButton.className = "lobby-btn";
    joinButton.textContent = buildLobbyJoinButtonLabel(model);
    joinButton.disabled = !model.canJoin || waiting;
    joinButton.addEventListener("click", () => {
        requestJoin(model.cityId);
    });

    cityActions.appendChild(joinButton);
    row.appendChild(info);
    row.appendChild(cityActions);
    return row;
};

export const renderLobbyCityList = ({
    state,
    cityList,
    cityFilter,
    waiting,
    waitingCity,
    requestJoin
}: LobbyCityListRenderOptions): void => {
    cityList.innerHTML = "";
    const cityIds = collectVisibleCities(state);
    const filtered = collectFilteredLobbyCities(cityIds, state, cityFilter);
    if (filtered.length === 0) {
        renderEmptyLobbyCityList(cityList, cityIds);
        return;
    }

    for (const cityId of filtered) {
        const model = buildLobbyCityRowModel(state, cityId, waiting, waitingCity);
        cityList.appendChild(createLobbyCityRow(model, waiting, requestJoin));
    }
};

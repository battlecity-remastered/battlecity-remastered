import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "../../app/state.js";
import type { EventSender } from "../../network/events.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";
import { getCityDisplayName } from "../../world/city-spawn.js";

const MAX_ASSIGNMENTS = 8;
const MAX_RECRUITS_PER_CITY = 7;
const DEFAULT_LOBBY_CITY_COUNT = 8;
const LOBBY_STYLE_ID = "battlecity-lobby-styles";

const collectVisibleCities = (state: ClientState): number[] => {
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

const resolveFilterLabel = (state: ClientState): string => {
    if (state.ui.lobbyCityFilter < 0) {
        return "all";
    }
    const city = state.ui.lobbyCityFilter;
    return getCityDisplayName(city);
};

const buildAssignmentSignature = (state: ClientState): string => {
    return state.lobby.assignments
        .map((entry) => `${entry.city}:${entry.mayorId ?? "-"}:${entry.recruitCount}`)
        .join("|");
};

const buildFinanceSignature = (state: ClientState): string => {
    return Array.from(state.cityFinance.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([city, finance]) => `${city}:${finance.score}:${finance.cash}:${finance.income}:${finance.researchLevel}`)
        .join("|");
};

const buildHighScoresSignature = (state: ClientState): string => {
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

    if (state.ui.lobbyView === "scores") {
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
            ranked.push("No player scores yet.");
        }
        return [header, tabs, mode, denied, released, ...ranked];
    }

    const assignments = state.lobby.assignments
        .filter((entry) => state.ui.lobbyCityFilter < 0 || state.ui.lobbyCityFilter === entry.city)
        .slice(0, MAX_ASSIGNMENTS)
        .map((entry) => {
            const mayor = entry.mayorId ?? "-";
            const label = getCityDisplayName(entry.city);
            return `${label}: mayor ${mayor} recruits ${entry.recruitCount}`;
        });
    if (assignments.length === 0) {
        assignments.push("No active assignments");
    }
    return [header, tabs, mode, denied, released, ...assignments];
};

type LobbyManager = {
    render: () => void;
    dispose: () => void;
};

const ensureLobbyStyles = (): void => {
    if (typeof document === "undefined") {
        return;
    }
    if (document.getElementById(LOBBY_STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = LOBBY_STYLE_ID;
    style.textContent = `
        .lobby-overlay-ts {
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(8, 10, 16, 0.85);
            z-index: 9999;
            pointer-events: auto;
        }
        .lobby-panel-ts {
            width: min(620px, 92vw);
            max-height: 86vh;
            background: #131722;
            border: 1px solid #2a3140;
            border-radius: 8px;
            padding: 24px 28px;
            color: #f5f7ff;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
            display: flex;
            flex-direction: column;
            gap: 20px;
            z-index: 70;
        }
        .lobby-header {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .lobby-title {
            font-size: 24px;
            font-weight: 600;
            margin: 0;
        }
        .lobby-subtitle {
            font-size: 14px;
            color: #b3b9c9;
            margin: 0;
        }
        .lobby-tabs {
            display: flex;
            gap: 8px;
            border-bottom: 1px solid rgba(53, 63, 83, 0.8);
            padding-bottom: 8px;
        }
        .lobby-tab {
            background: transparent;
            border: none;
            color: #b3b9c9;
            font-size: 14px;
            padding: 6px 12px;
            border-radius: 6px 6px 0 0;
            cursor: pointer;
            transition: background 0.2s, color 0.2s;
        }
        .lobby-tab:hover {
            color: #f5f7ff;
        }
        .lobby-tab:focus {
            outline: none;
            box-shadow: 0 0 0 2px rgba(123, 225, 125, 0.35);
        }
        .lobby-tab.active {
            background: rgba(53, 63, 83, 0.6);
            color: #f5f7ff;
            font-weight: 600;
        }
        .lobby-tab-panels {
            flex: 1;
            min-height: 0;
            display: flex;
            position: relative;
        }
        .lobby-tab-panel {
            flex: 1;
            display: none;
            flex-direction: column;
            min-height: 0;
        }
        .lobby-tab-panel.active {
            display: flex;
        }
        .lobby-city-filter {
            display: flex;
            margin-bottom: 12px;
        }
        .lobby-city-filter-input {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #384156;
            border-radius: 4px;
            background: #0f131d;
            color: #e1e6f6;
            font-size: 13px;
        }
        .lobby-city-filter-input:focus {
            outline: none;
            border-color: #5c9eff;
            box-shadow: 0 0 0 1px rgba(92, 158, 255, 0.25);
        }
        .lobby-city-list {
            flex: 1;
            overflow-y: auto;
            padding-right: 6px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 0;
        }
        .lobby-city-empty,
        .lobby-highscore-empty {
            color: #b3b9c9;
            font-size: 14px;
            text-align: center;
            padding: 24px 0;
        }
        .lobby-city-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(22, 27, 38, 0.85);
            border: 1px solid rgba(53, 63, 83, 0.8);
            border-radius: 6px;
            padding: 12px 16px;
            gap: 16px;
        }
        .lobby-city-row.waiting {
            border-color: #5c9eff;
            box-shadow: 0 0 0 1px rgba(92, 158, 255, 0.35);
        }
        .lobby-city-info {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
        }
        .lobby-city-name {
            font-size: 16px;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .lobby-city-meta {
            font-size: 13px;
            color: #9aa3b8;
        }
        .lobby-city-actions {
            display: flex;
            gap: 8px;
        }
        .lobby-highscore-list {
            flex: 1;
            overflow-y: auto;
            padding-right: 6px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-height: 0;
        }
        .lobby-highscore-row {
            display: grid;
            grid-template-columns: 44px 1fr 120px;
            align-items: center;
            background: rgba(22, 27, 38, 0.85);
            border: 1px solid rgba(53, 63, 83, 0.8);
            border-radius: 6px;
            padding: 10px 14px;
            gap: 12px;
            font-size: 14px;
        }
        .lobby-highscore-rank {
            font-weight: 600;
            color: #7be17d;
            text-align: center;
        }
        .lobby-highscore-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }
        .lobby-highscore-name {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
        .lobby-highscore-meta {
            font-size: 12px;
            color: #8d94a7;
        }
        .lobby-highscore-score {
            text-align: right;
            color: #ffc977;
            font-weight: 600;
        }
        .lobby-btn {
            background: #1f2534;
            color: #e1e6f6;
            border: 1px solid #384156;
            border-radius: 4px;
            padding: 8px 14px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s, transform 0.15s;
        }
        .lobby-btn:hover:not(:disabled) {
            background: #2a3245;
            border-color: #4f5d7c;
        }
        .lobby-btn:active:not(:disabled) {
            transform: translateY(1px);
        }
        .lobby-btn:disabled {
            opacity: 0.45;
            cursor: default;
        }
        .lobby-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        .lobby-action-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .lobby-status {
            font-size: 13px;
            color: #b3b9c9;
            min-height: 18px;
        }
        .lobby-status[data-type="error"] {
            color: #ff8080;
        }
        .lobby-status[data-type="warn"] {
            color: #ffc977;
        }
        .lobby-status[data-type="success"] {
            color: #7be17d;
        }
    `;
    document.head.appendChild(style);
};

export const createLobbyManager = (
    state: ClientState,
    send: EventSender | null = null,
    root: HTMLElement | null = typeof document === "undefined"
        ? null
        : (document.getElementById("app") ?? document.body)
): LobbyManager => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    ensureLobbyStyles();

    const overlay = document.createElement("div");
    overlay.className = "lobby-overlay-ts";
    const panel = document.createElement("div");
    panel.setAttribute("data-ui", "lobby");
    panel.className = "lobby-panel-ts";

    const header = document.createElement("div");
    header.className = "lobby-header";

    const title = document.createElement("h2");
    title.className = "lobby-title";
    title.textContent = "City Lobby";

    const subtitle = document.createElement("p");
    subtitle.className = "lobby-subtitle";
    subtitle.textContent = "Choose a city to join as mayor or recruit.";

    header.appendChild(title);
    header.appendChild(subtitle);

    const tabs = document.createElement("div");
    tabs.className = "lobby-tabs";

    const citiesTab = document.createElement("button");
    citiesTab.type = "button";
    citiesTab.className = "lobby-tab";
    citiesTab.textContent = "Lobby";

    const scoresTab = document.createElement("button");
    scoresTab.type = "button";
    scoresTab.className = "lobby-tab";
    scoresTab.textContent = "High Scores";

    tabs.appendChild(citiesTab);
    tabs.appendChild(scoresTab);

    const tabPanels = document.createElement("div");
    tabPanels.className = "lobby-tab-panels";

    const cityPanel = document.createElement("div");
    cityPanel.className = "lobby-tab-panel";

    const cityFilterWrap = document.createElement("div");
    cityFilterWrap.className = "lobby-city-filter";

    const cityFilterInput = document.createElement("input");
    cityFilterInput.type = "search";
    cityFilterInput.className = "lobby-city-filter-input";
    cityFilterInput.placeholder = "Filter cities by name...";

    cityFilterWrap.appendChild(cityFilterInput);

    const cityList = document.createElement("div");
    cityList.className = "lobby-city-list";

    cityPanel.appendChild(cityFilterWrap);
    cityPanel.appendChild(cityList);

    const scorePanel = document.createElement("div");
    scorePanel.className = "lobby-tab-panel";

    const scoreList = document.createElement("div");
    scoreList.className = "lobby-highscore-list";
    scorePanel.appendChild(scoreList);

    tabPanels.appendChild(cityPanel);
    tabPanels.appendChild(scorePanel);

    const actions = document.createElement("div");
    actions.className = "lobby-actions";

    const actionGroup = document.createElement("div");
    actionGroup.className = "lobby-action-group";

    const autoButton = document.createElement("button");
    autoButton.type = "button";
    autoButton.className = "lobby-btn";
    autoButton.textContent = "Auto Assign";

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "lobby-btn";
    refreshButton.textContent = "Refresh";

    actionGroup.appendChild(autoButton);
    actionGroup.appendChild(refreshButton);
    actions.appendChild(actionGroup);

    const statusNode = document.createElement("div");
    statusNode.className = "lobby-status";
    statusNode.dataset.type = "info";
    statusNode.textContent = "Connected. Choose a city to enter.";

    panel.appendChild(header);
    panel.appendChild(tabs);
    panel.appendChild(tabPanels);
    panel.appendChild(actions);
    panel.appendChild(statusNode);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    const dirty = createDirtyFlagTracker();

    let cityFilter = "";
    let waiting = false;
    let waitingCity: number | null = null;
    let waitingSinceMs = 0;
    let lastDeniedReason: string | null = state.lobby.deniedReason;
    let lastLocalAssignment = `${state.local.id ?? ""}:${state.local.city}`;

    const setStatus = (message: string, type: "info" | "warn" | "error" | "success" = "info"): void => {
        statusNode.dataset.type = type;
        statusNode.textContent = message;
    };

    const setTab = (view: "assignments" | "scores"): void => {
        state.ui.lobbyView = view;
    };

    const syncTabState = (): void => {
        const showScores = state.ui.lobbyView === "scores";
        citiesTab.classList.toggle("active", !showScores);
        scoresTab.classList.toggle("active", showScores);
        cityPanel.classList.toggle("active", !showScores);
        scorePanel.classList.toggle("active", showScores);
    };

    const buildJoinPayload = (desiredCity?: number): KnownEventPayloadByType["lobby.join.request"] => {
        const payload: KnownEventPayloadByType["lobby.join.request"] = {
            callsign: state.identity.callsign
        };
        if (typeof desiredCity === "number") {
            payload.desiredCity = desiredCity;
        }
        if (typeof state.identity.userId === "string" && state.identity.userId.length > 0) {
            payload.userId = state.identity.userId;
        }
        return payload;
    };

    const requestJoin = (desiredCity?: number): void => {
        if (!send) {
            setStatus("Lobby join controls unavailable.", "error");
            return;
        }
        waiting = true;
        waitingCity = typeof desiredCity === "number" ? desiredCity : null;
        waitingSinceMs = Date.now();
        if (typeof desiredCity === "number") {
            setStatus(`Requesting assignment in ${getCityDisplayName(desiredCity)}...`, "info");
        } else {
            setStatus("Requesting automatic assignment...", "info");
        }
        send("lobby.join.request", buildJoinPayload(desiredCity));
        dirty.markDirty("lobby.panel");
    };

    const renderHighScores = (): void => {
        scoreList.innerHTML = "";
        const ranked = [...state.lobby.highScores]
            .sort((a, b) => {
                const scoreDiff = b.points - a.points;
                if (scoreDiff !== 0) {
                    return scoreDiff;
                }
                return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
            })
            .slice(0, 20);

        if (ranked.length === 0) {
            const empty = document.createElement("div");
            empty.className = "lobby-highscore-empty";
            empty.textContent = "No player scores yet.";
            scoreList.appendChild(empty);
            return;
        }

        ranked.forEach((entry, index) => {
            const row = document.createElement("div");
            row.className = "lobby-highscore-row";

            const rank = document.createElement("div");
            rank.className = "lobby-highscore-rank";
            rank.textContent = `#${index + 1}`;

            const info = document.createElement("div");
            info.className = "lobby-highscore-info";

            const name = document.createElement("div");
            name.className = "lobby-highscore-name";
            name.textContent = entry.name && entry.name.trim().length > 0
                ? entry.name
                : "Unknown Pilot";

            const meta = document.createElement("div");
            meta.className = "lobby-highscore-meta";
            const details = [`Rank: ${entry.rankTitle}`];
            if (typeof entry.orbs === "number" && Number.isFinite(entry.orbs) && entry.orbs > 0) {
                details.push(`Orbs: ${entry.orbs}`);
            }
            if (typeof entry.assists === "number" && Number.isFinite(entry.assists) && entry.assists > 0) {
                details.push(`Assists: ${entry.assists}`);
            }
            meta.textContent = details.join(" • ");

            info.appendChild(name);
            info.appendChild(meta);

            const score = document.createElement("div");
            score.className = "lobby-highscore-score";
            score.textContent = `${Math.max(0, Math.floor(entry.points)).toLocaleString()} pts`;

            row.appendChild(rank);
            row.appendChild(info);
            row.appendChild(score);
            scoreList.appendChild(row);
        });
    };

    const renderCityList = (): void => {
        cityList.innerHTML = "";
        const cityIds = collectVisibleCities(state);
        const filterText = cityFilter.trim().toLowerCase();

        const filtered = cityIds.filter((cityId) => {
            if (state.ui.lobbyCityFilter >= 0 && state.ui.lobbyCityFilter !== cityId) {
                return false;
            }
            if (filterText.length === 0) {
                return true;
            }
            const label = `${getCityDisplayName(cityId)} c${cityId}`.toLowerCase();
            return label.includes(filterText);
        });

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "lobby-city-empty";
            empty.textContent = cityIds.length === 0
                ? "Waiting for city assignments..."
                : "No cities match that filter.";
            cityList.appendChild(empty);
            return;
        }

        for (const cityId of filtered) {
            const assignment = state.lobby.assignments.find((entry) => entry.city === cityId);
            const finance = state.cityFinance.get(cityId);
            const mayorId = assignment?.mayorId ?? null;
            const recruitCount = assignment?.recruitCount ?? 0;
            const players = (mayorId ? 1 : 0) + recruitCount;
            const hasMayorSlot = mayorId === null;
            const hasRecruitSlot = recruitCount < MAX_RECRUITS_PER_CITY;
            const canJoin = hasMayorSlot || hasRecruitSlot;

            const row = document.createElement("div");
            row.className = "lobby-city-row";
            if (waiting && waitingCity === cityId) {
                row.classList.add("waiting");
            }

            const info = document.createElement("div");
            info.className = "lobby-city-info";

            const name = document.createElement("div");
            name.className = "lobby-city-name";
            name.textContent = getCityDisplayName(cityId);

            const meta = document.createElement("div");
            meta.className = "lobby-city-meta";
            const mayorLabel = mayorId ? mayorId : "(open)";
            const parts = [
                `Mayor: ${mayorLabel}`,
                `Players: ${players}/${1 + MAX_RECRUITS_PER_CITY}`
            ];
            if (finance) {
                parts.push(`Score: ${finance.score}`);
            }
            meta.textContent = parts.join(" • ");

            info.appendChild(name);
            info.appendChild(meta);

            const cityActions = document.createElement("div");
            cityActions.className = "lobby-city-actions";

            const joinButton = document.createElement("button");
            joinButton.type = "button";
            joinButton.className = "lobby-btn";
            joinButton.textContent = hasMayorSlot ? "Join Mayor" : hasRecruitSlot ? "Join Recruit" : "Full";
            joinButton.disabled = !canJoin || waiting;
            joinButton.addEventListener("click", () => {
                requestJoin(cityId);
            });

            cityActions.appendChild(joinButton);
            row.appendChild(info);
            row.appendChild(cityActions);
            cityList.appendChild(row);
        }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        if (state.ui.showIntroModal || state.ui.showOptionsModal) {
            return;
        }
        if (applyLobbyAction(state, event.key)) {
            event.preventDefault();
        }
    };

    const onCitiesTabClick = (): void => {
        setTab("assignments");
        dirty.markDirty("lobby.panel");
    };

    const onScoresTabClick = (): void => {
        setTab("scores");
        dirty.markDirty("lobby.panel");
    };

    const onFilterInput = (): void => {
        cityFilter = cityFilterInput.value;
        dirty.markDirty("lobby.panel");
    };

    const onFilterKeyDown = (event: KeyboardEvent): void => {
        event.stopPropagation();
    };

    const onAutoAssignClick = (): void => {
        requestJoin();
    };

    const onRefreshClick = (): void => {
        dirty.markDirty("lobby.panel");
        setStatus("Lobby view refreshed.", "info");
    };

    window.addEventListener("keydown", onKeyDown);
    citiesTab.addEventListener("click", onCitiesTabClick);
    scoresTab.addEventListener("click", onScoresTabClick);
    cityFilterInput.addEventListener("input", onFilterInput);
    cityFilterInput.addEventListener("keydown", onFilterKeyDown);
    autoButton.addEventListener("click", onAutoAssignClick);
    refreshButton.addEventListener("click", onRefreshClick);

    return {
        render: () => {
            const hiddenByModal = state.ui.showOptionsModal
                || state.ui.showIntroModal
                || state.ui.showHelpModal
                || state.ui.showMapModal;
            const showLobby = !hiddenByModal && state.local.id === null;
            overlay.style.display = showLobby ? "flex" : "none";
            if (showLobby) {
                state.ui.showBuildMenu = false;
                state.ui.buildGhostMode = false;
                state.ui.buildDemolishMode = false;
                state.ui.pendingBuildPlacement = null;
            }

            const localAssignment = `${state.local.id ?? ""}:${state.local.city}`;
            if (waiting && localAssignment !== lastLocalAssignment) {
                waiting = false;
                waitingCity = null;
                setStatus(`Assignment confirmed for ${getCityDisplayName(state.local.city)}.`, "success");
            }
            if (waiting && Date.now() - waitingSinceMs > 2500) {
                waiting = false;
                waitingCity = null;
            }
            lastLocalAssignment = localAssignment;

            if (state.lobby.deniedReason !== lastDeniedReason && state.lobby.deniedReason) {
                waiting = false;
                waitingCity = null;
                setStatus(`Join denied: ${state.lobby.deniedReason}`, "warn");
            }
            lastDeniedReason = state.lobby.deniedReason;

            subtitle.textContent = `Current city: ${getCityDisplayName(state.local.city)} • Filter: ${resolveFilterLabel(state)}`;

            const signature = `${overlay.style.display}|${state.ui.lobbyView}|${state.ui.lobbyCityFilter}|${cityFilter}|${waiting}|${waitingCity ?? -1}|${state.lobby.deniedReason ?? "-"}|${state.lobby.lastReleasedPlayerId ?? "-"}|${localAssignment}|${buildAssignmentSignature(state)}|${buildFinanceSignature(state)}|${buildHighScoresSignature(state)}`;
            if (dirty.shouldRender("lobby.panel", signature)) {
                syncTabState();
                renderCityList();
                renderHighScores();
                autoButton.disabled = waiting;
                refreshButton.disabled = waiting;
            }
        },
        dispose: () => {
            window.removeEventListener("keydown", onKeyDown);
            citiesTab.removeEventListener("click", onCitiesTabClick);
            scoresTab.removeEventListener("click", onScoresTabClick);
            cityFilterInput.removeEventListener("input", onFilterInput);
            cityFilterInput.removeEventListener("keydown", onFilterKeyDown);
            autoButton.removeEventListener("click", onAutoAssignClick);
            refreshButton.removeEventListener("click", onRefreshClick);
            dirty.clear();
            overlay.remove();
        }
    };
};

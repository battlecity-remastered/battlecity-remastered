import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "../../app/state.js";
import type { EventSender } from "../../network/events.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";
import { getCityDisplayName } from "../../world/city-spawn.js";
import { renderLobbyCityList } from "./lobby-city-list.js";
import { renderLobbyHighScores } from "./lobby-high-scores.js";
import { createLobbyLayout } from "./lobby-layout.js";
import {
    applyLobbyAction,
    buildAssignmentSignature,
    buildFinanceSignature,
    buildHighScoresSignature,
    resolveFilterLabel
} from "./lobby-state.js";
import { ensureLobbyStyles } from "./lobby-styles.js";

export { applyLobbyAction, buildLobbyLines } from "./lobby-state.js";

type LobbyManager = {
    render: () => void;
    dispose: () => void;
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
            render: () => { },
            dispose: () => { }
        };
    }

    ensureLobbyStyles();

    const { overlay, subtitle, citiesTab, scoresTab, cityPanel, scorePanel, cityFilterInput, cityList, scoreList, autoButton, refreshButton, statusNode } = createLobbyLayout(root);

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
        return {
            callsign: state.identity.callsign,
            ...(typeof desiredCity === "number" ? { desiredCity } : {}),
            ...(typeof state.identity.userId === "string" && state.identity.userId.length > 0
                ? { userId: state.identity.userId }
                : {})
        };
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

    const renderCityList = (): void => {
        renderLobbyCityList({
            state,
            cityList,
            cityFilter,
            waiting,
            waitingCity,
            requestJoin
        });
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

    const updateAssignmentStatus = (): string => {
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

        return localAssignment;
    };
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

            const localAssignment = updateAssignmentStatus();

            subtitle.textContent = `Current city: ${getCityDisplayName(state.local.city)} • Filter: ${resolveFilterLabel(state)}`;

            const signature = `${overlay.style.display}|${state.ui.lobbyView}|${state.ui.lobbyCityFilter}|${cityFilter}|${waiting}|${waitingCity ?? -1}|${state.lobby.deniedReason ?? "-"}|${state.lobby.lastReleasedPlayerId ?? "-"}|${localAssignment}|${buildAssignmentSignature(state)}|${buildFinanceSignature(state)}|${buildHighScoresSignature(state)}`;
            if (dirty.shouldRender("lobby.panel", signature)) {
                syncTabState();
                renderCityList();
                renderLobbyHighScores(state, scoreList);
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

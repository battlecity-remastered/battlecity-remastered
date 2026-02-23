import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, okResult, type RuntimeConfig, type RuntimeState } from "../../runtime/types.js";

const clampCity = (desiredCity: number | undefined, config: RuntimeConfig): number => {
    if (typeof desiredCity !== "number" || Number.isNaN(desiredCity)) {
        return config.defaultCity;
    }
    const city = Math.floor(desiredCity);
    if (city < 0) {
        return 0;
    }
    if (city >= config.cityCount) {
        return config.cityCount - 1;
    }
    return city;
};

const hasMayor = (state: RuntimeState, city: number): boolean => {
    for (const [socketId, role] of state.socketRoles.entries()) {
        if (state.socketCities.get(socketId) === city && role === "mayor") {
            return true;
        }
    }
    return false;
};

const recruitsInCity = (state: RuntimeState, city: number): number => {
    let count = 0;
    for (const [socketId, role] of state.socketRoles.entries()) {
        if (state.socketCities.get(socketId) === city && role === "recruit") {
            count += 1;
        }
    }
    return count;
};

export const joinLobby = (
    state: RuntimeState,
    socketId: string,
    desiredCity: number | undefined,
    config: RuntimeConfig
): CommandResult<KnownEventPayloadByType["lobby.assignment"]> => {
    const city = clampCity(desiredCity, config);
    const role = hasMayor(state, city) ? "recruit" : "mayor";

    if (role === "recruit" && recruitsInCity(state, city) >= config.maxRecruitsPerCity) {
        return rejectResult("lobby_full");
    }

    state.socketCities.set(socketId, city);
    state.socketRoles.set(socketId, role);

    return okResult({
        id: socketId,
        city,
        role
    });
};

export const leaveLobby = (
    state: RuntimeState,
    socketId: string
): KnownEventPayloadByType["lobby.released"] | undefined => {
    const city = state.socketCities.get(socketId);
    state.socketCities.delete(socketId);
    state.socketRoles.delete(socketId);

    if (city === undefined) {
        return undefined;
    }

    return {
        id: socketId,
        city
    };
};

export const buildLobbySnapshot = (
    state: RuntimeState,
    config: RuntimeConfig
): KnownEventPayloadByType["lobby.snapshot"] => {
    const entries: Array<KnownEventPayloadByType["lobby.snapshot"][number]> = [];

    for (let city = 0; city < config.cityCount; city += 1) {
        let mayorId: string | undefined;
        let recruitCount = 0;

        for (const [socketId, assignedCity] of state.socketCities.entries()) {
            if (assignedCity !== city) {
                continue;
            }

            const role = state.socketRoles.get(socketId);
            if (role === "mayor" && mayorId === undefined) {
                mayorId = socketId;
            }
            if (role === "recruit") {
                recruitCount += 1;
            }
        }

        entries.push({
            city,
            mayorId,
            recruitCount
        });
    }

    return entries;
};

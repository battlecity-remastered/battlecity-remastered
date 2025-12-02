"use strict";

const path = require("path");
const { fork } = require("child_process");
const { pathToFileURL } = require("url");
const { setTimeout: delay } = require("timers/promises");
const { io } = require("../../bot/node_modules/socket.io-client");
const { setWorldConstructor } = require("../localCucumber.js");

const SERVER_START_TIMEOUT_MS = 10000;
const JOIN_TIMEOUT_MS = 8000;

class BattleCityWorld {

    constructor() {
        this.serverProcess = null;
        this.serverPort = null;
        this.sockets = [];
        this.socketById = new Map();
        this.joinResults = [];
        this.lastJoin = null;
        this.citySpawnModule = null;
        this.serverConstants = null;
        this.testPlayer = null;
    }

    async startServer() {
        if (this.serverProcess) {
            return;
        }
        const basePort = 19000;
        const randomOffset = Math.floor(Math.random() * 1000);
        this.serverPort = basePort + randomOffset;
        this.serverProcess = fork(path.join(process.cwd(), "server", "app.js"), [], {
            cwd: path.join(process.cwd(), "server"),
            env: {
                ...process.env,
                PORT: String(this.serverPort),
                CLIENT_ORIGINS: "*",
                SERVER_DISABLE_FAKE_CITIES: "true",
                TEST_MODE: "true"
            },
            stdio: "pipe"
        });
        await this.waitForHealth();
    }

    async waitForHealth() {
        const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
        const url = `http://127.0.0.1:${this.serverPort}/health`;
        while (Date.now() < deadline) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    return;
                }
            } catch (_error) {
                // retry until timeout
            }
            await delay(200);
        }
        throw new Error(`Server failed to start on port ${this.serverPort}`);
    }

    async stopServer() {
        if (!this.serverProcess) {
            return;
        }
        const processRef = this.serverProcess;
        this.serverProcess = null;
        processRef.kill();
        await new Promise((resolve) => {
            processRef.once("exit", resolve);
            setTimeout(resolve, 2000);
        });
    }

    async closeSockets() {
        const pending = this.sockets.map((socket) => new Promise((resolve) => {
            socket.once("disconnect", resolve);
            socket.disconnect();
            setTimeout(resolve, 500);
        }));
        this.sockets = [];
        this.socketById.clear();
        if (pending.length) {
            await Promise.all(pending);
        }
    }

    parsePayload(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload === "string") {
            try {
                return JSON.parse(payload);
            } catch (_error) {
                return null;
            }
        }
        return payload;
    }

    async connectPlayer(requestPayload = {}) {
        await this.startServer();
        const socket = io(`http://127.0.0.1:${this.serverPort}`, {
            transports: ["websocket"],
            forceNew: true,
            timeout: 5000,
            reconnection: false
        });
        this.sockets.push(socket);
        const result = { assignment: null, player: null };

        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.removeAllListeners();
                reject(new Error("Timed out waiting for join"));
            }, JOIN_TIMEOUT_MS);

            const cleanup = () => {
                clearTimeout(timer);
                socket.removeAllListeners();
            };

            socket.on("connect", () => {
                this.socketById.set(socket.id, socket);
                socket.emit("enter_game", JSON.stringify(requestPayload));
            });

            socket.on("lobby:assignment", (assignment) => {
                result.assignment = this.parsePayload(assignment);
                if (result.assignment && result.player) {
                    cleanup();
                    resolve();
                }
            });

            socket.on("player", (playerPayload) => {
                const parsed = this.parsePayload(playerPayload);
                if (parsed && parsed.id === socket.id) {
                    result.player = parsed;
                    result.socketId = socket.id;
                    if (result.assignment) {
                        cleanup();
                        resolve();
                    }
                }
            });

            socket.on("connect_error", (error) => {
                cleanup();
                reject(error);
            });
            socket.on("connect_timeout", () => {
                cleanup();
                reject(new Error("Connect timeout"));
            });
        });

        result.socket = socket;
        return result;
    }

    async loadCitySpawn(cityId) {
        if (!this.citySpawnModule) {
            const modulePath = pathToFileURL(path.join(process.cwd(), "client", "src", "utils", "citySpawns.js"));
            this.citySpawnModule = await import(modulePath.href);
        }
        const spawn = this.citySpawnModule.getCitySpawn(Number(cityId));
        if (!spawn) {
            throw new Error(`No spawn found for city ${cityId}`);
        }
        return spawn;
    }

    async fetchServerJson(pathname, options = {}) {
        await this.startServer();
        const url = `http://127.0.0.1:${this.serverPort}${pathname}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });
        if (!response.ok) {
            const message = await response.text();
            throw new Error(`Request failed (${response.status}): ${message}`);
        }
        return response.json();
    }

    async clearCityInventory(cityId, itemType = null) {
        const body = (itemType === null || itemType === undefined) ? {} : { itemType };
        await this.fetchServerJson(`/test/city/${encodeURIComponent(cityId)}/inventory/clear`, {
            method: "POST",
            body: JSON.stringify(body)
        });
    }

    getSocketById(id) {
        if (!id) {
            return null;
        }
        return this.socketById.get(id) || null;
    }

    async loadServerConstants() {
        if (this.serverConstants) {
            return this.serverConstants;
        }
        const payload = await this.fetchServerJson("/test/constants");
        this.serverConstants = payload;
        return payload;
    }

    async setPlayerHealth(socketId, health) {
        await this.fetchServerJson(`/test/player/${encodeURIComponent(socketId)}/health`, {
            method: "POST",
            body: JSON.stringify({ health })
        });
    }

    async grantPlayerItem(socketId, itemType, quantity = 1) {
        const result = await this.fetchServerJson(`/test/player/${encodeURIComponent(socketId)}/inventory`, {
            method: "POST",
            body: JSON.stringify({ itemType, quantity })
        });
        return result;
    }

    async createDefense({
        id = null,
        cityId = 0,
        type,
        x = 0,
        y = 0,
        life = null,
        maxLife = null,
        ownerId = null,
        teamId = null,
        consumeInventory = false
    }) {
        const payload = { id, cityId, teamId, type, x, y, life, maxLife, ownerId, consumeInventory };
        const result = await this.fetchServerJson("/test/defense", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        return result && result.defense;
    }

    async getDefense(id) {
        const result = await this.fetchServerJson(`/test/defense/${encodeURIComponent(id)}`);
        return result && result.defense;
    }

    async fireDefenseRound({ socketId, sourceType = "turret", sourceId = "test_turret", x, y, angle = 0, type = 0, teamId = null }) {
        await this.fetchServerJson("/test/defense/fire", {
            method: "POST",
            body: JSON.stringify({ socketId, sourceType, sourceId, x, y, angle, type, teamId })
        });
    }

    async createBuilding({ id = null, type, x = 0, y = 0, cityId = 0, itemsLeft = 0, population = null }) {
        const payload = { id, type, x, y, cityId, itemsLeft, population };
        const result = await this.fetchServerJson("/test/building", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        return result && result.building;
    }

    async simulateFactoryProduction(buildingId, { itemType = null, quantity = 1 } = {}) {
        const payload = { buildingId, itemType, quantity };
        await this.fetchServerJson("/test/factory/produce", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    async setFactoryStock(buildingId, itemsLeft = 0) {
        const payload = { buildingId, itemsLeft };
        const result = await this.fetchServerJson("/test/factory/stock", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        return result && result.building;
    }

    async getOutstanding(cityId, itemType) {
        const result = await this.fetchServerJson(
            `/test/factory/outstanding/${encodeURIComponent(cityId)}/${encodeURIComponent(itemType)}`
        );
        return result && typeof result.outstanding === "number" ? result.outstanding : null;
    }

    async collectFactoryItem(buildingId, { socketId, itemType, quantity = 1 } = {}) {
        const payload = { buildingId, type: itemType, quantity };
        await this.fetchServerJson("/test/factory/pickup", {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
                "X-Socket-Id": socketId
            }
        });
    }

    async getBuilding(buildingId) {
        const result = await this.fetchServerJson(`/test/building/${encodeURIComponent(buildingId)}`);
        return result && result.building;
    }

    async loadPlayerState(socketId) {
        const payload = await this.fetchServerJson(`/test/player/${encodeURIComponent(socketId)}`);
        return payload;
    }

    async setPlayerPosition(socketId, x, y) {
        const payload = await this.fetchServerJson(`/test/player/${encodeURIComponent(socketId)}/position`, {
            method: "POST",
            body: JSON.stringify({ x, y })
        });
        return payload && payload.offset;
    }

    async ensureTestPlayer(cityId = 0) {
        if (this.testPlayer) {
            return this.testPlayer;
        }
        const join = await this.connectPlayer({ desiredCity: cityId });
        this.testPlayer = {
            socketId: join.socketId || (join.player && join.player.id) || null,
            player: join.player,
            assignment: join.assignment
        };
        return this.testPlayer;
    }

    waitForHealthUpdate(targetSocketId, timeoutMs = 3000) {
        const socket = this.getSocketById(targetSocketId);
        if (!socket) {
            throw new Error(`No socket found for ${targetSocketId}`);
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.off("player:health", onHealth);
                reject(new Error("Timed out waiting for health update"));
            }, timeoutMs);
            const onHealth = (payload) => {
                const data = this.parsePayload(payload);
                if (data && data.id === targetSocketId) {
                    clearTimeout(timer);
                    socket.off("player:health", onHealth);
                    resolve(data);
                }
            };
            socket.on("player:health", onHealth);
        });
    }

    async waitForDefense(id, timeoutMs = 1000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const defense = await this.getDefense(id);
                if (defense) {
                    return defense;
                }
            } catch (_error) {
                // Retry until timeout
            }
            await delay(50);
        }
        throw new Error(`Timed out waiting for defense ${id}`);
    }

    async destroyDefense(id, { socketId = null, reason = "destroyed" } = {}) {
        const socket = socketId ? this.getSocketById(socketId) : this.sockets[0];
        if (!socket) {
            throw new Error("No socket available to destroy defense");
        }
        const payload = JSON.stringify({ id, reason });
        socket.emit("defense:remove", payload);
        await delay(50);
    }

    waitForIcon(type, buildingId = null, { socketId = null, timeoutMs = 3000 } = {}) {
        const socket = socketId ? this.getSocketById(socketId) : this.sockets[0];
        if (!socket) {
            throw new Error("No socket available to wait for icon");
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error("Timed out waiting for icon production"));
            }, timeoutMs);

            const cleanup = () => {
                clearTimeout(timer);
                socket.off("new_icon", onIcon);
            };

            const onIcon = (payload) => {
                const data = this.parsePayload(payload);
                if (!data) {
                    return;
                }
                const typeMatch = Number(data.type) === Number(type);
                const buildingMatch = buildingId === null || data.buildingId === buildingId;
                if (typeMatch && buildingMatch) {
                    cleanup();
                    resolve(data);
                }
            };

            socket.on("new_icon", onIcon);
        });
    }
}

setWorldConstructor(BattleCityWorld);

module.exports = BattleCityWorld;

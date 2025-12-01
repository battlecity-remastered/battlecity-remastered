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
        this.joinResults = [];
        this.lastJoin = null;
        this.citySpawnModule = null;
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
                SERVER_DISABLE_FAKE_CITIES: "true"
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
}

setWorldConstructor(BattleCityWorld);

module.exports = BattleCityWorld;

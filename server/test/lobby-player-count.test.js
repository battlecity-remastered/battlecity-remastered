"use strict";

const assert = require("assert");
const { test, beforeEach, afterEach } = require("node:test");
const { fork } = require("child_process");
const path = require("path");
const { clearTimeout, setTimeout } = require("timers");
const { setTimeout: delay } = require("timers/promises");
const { io } = require(path.join(__dirname, "..", "..", "client", "node_modules", "socket.io-client"));

let serverProcess = null;
let port = null;

const startServer = async () => {
    const chosenPort = 22000 + Math.floor(Math.random() * 500);
    const child = fork(path.join(__dirname, "..", "app.js"), [], {
        cwd: path.join(__dirname, ".."),
        env: {
            ...process.env,
            PORT: String(chosenPort),
            CLIENT_ORIGINS: "*",
            TEST_MODE: "true"
        },
        stdio: "pipe"
    });
    const healthUrl = `http://127.0.0.1:${chosenPort}/health`;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(healthUrl);
            if (response.ok) {
                serverProcess = child;
                port = chosenPort;
                return;
            }
        } catch (_error) {
            // retry
        }
        await delay(200);
    }
    child.kill();
    throw new Error("Server failed to start");
};

const stopServer = async () => {
    if (serverProcess) {
        serverProcess.kill();
        await new Promise((resolve) => serverProcess.once("exit", resolve));
        serverProcess = null;
        port = null;
    }
};

beforeEach(async () => {
    await startServer();
});

afterEach(async () => {
    await stopServer();
});

const parseSnapshot = (payload) => {
    if (payload === null || payload === undefined) {
        return null;
    }
    if (typeof payload === "string") {
        return JSON.parse(payload);
    }
    return payload;
};

const findCityEntry = (snapshot, cityId) => {
    if (!snapshot || !Array.isArray(snapshot.cities)) {
        return null;
    }
    return snapshot.cities.find((city) => Number(city.id) === Number(cityId));
};

const waitForSnapshot = (socket, timeoutMs = 5000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
        cleanup();
        reject(new Error("timed out waiting for lobby snapshot"));
    }, timeoutMs);

    const handler = (payload) => {
        const data = parseSnapshot(payload);
        if (!data || !Array.isArray(data.cities)) {
            return;
        }
        cleanup();
        resolve(data);
    };

    const cleanup = () => {
        clearTimeout(timer);
        socket.off("lobby:snapshot", handler);
        socket.off("lobby:update", handler);
    };

    socket.on("lobby:snapshot", handler);
    socket.on("lobby:update", handler);
});

const waitForCityCount = (socket, cityId, predicate, timeoutMs = 5000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
        cleanup();
        reject(new Error("timed out waiting for lobby count change"));
    }, timeoutMs);

    const handler = (payload) => {
        const snapshot = parseSnapshot(payload);
        const city = findCityEntry(snapshot, cityId);
        if (!city) {
            return;
        }
        const count = Number.isFinite(city.playerCount) ? city.playerCount : 0;
        if (!predicate(count, snapshot)) {
            return;
        }
        cleanup();
        resolve({ count, snapshot });
    };

    const cleanup = () => {
        clearTimeout(timer);
        socket.off("lobby:snapshot", handler);
        socket.off("lobby:update", handler);
    };

    socket.on("lobby:snapshot", handler);
    socket.on("lobby:update", handler);
});

test("Lobby player count returns to baseline after a player leaves", async () => {
    const socket = io(`http://127.0.0.1:${port}`, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false
    });

    try {
        let latestSnapshot = null;
        const updateLatestSnapshot = (payload) => {
            const data = parseSnapshot(payload);
            if (data && Array.isArray(data.cities)) {
                latestSnapshot = data;
            }
        };
        socket.on("lobby:snapshot", updateLatestSnapshot);
        socket.on("lobby:update", updateLatestSnapshot);

        const initialSnapshotPromise = waitForSnapshot(socket, 10000);
        const assignmentPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("assignment timeout")), 10000);
            const handler = (payload) => {
                clearTimeout(timer);
                socket.off("lobby:assignment", handler);
                resolve(parseSnapshot(payload));
            };
            socket.on("lobby:assignment", handler);
        });

        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("connect timeout")), 10000);
            socket.once("connect", () => {
                clearTimeout(timer);
                resolve();
            });
            socket.once("connect_error", reject);
        });

        const initialSnapshot = await initialSnapshotPromise;
        latestSnapshot = initialSnapshot;
        const preferredCity = Number.isFinite(initialSnapshot?.cities?.[0]?.id)
            ? initialSnapshot.cities[0].id
            : 0;

        socket.emit("enter_game", JSON.stringify({ city: preferredCity }));
        const assignment = await assignmentPromise;
        assert(assignment && Number.isFinite(assignment.city), "No lobby assignment received");

        const assignedCityId = assignment.city;
        const assignedBaselineEntry = findCityEntry(initialSnapshot, assignedCityId);
        const baselineCount = assignedBaselineEntry && Number.isFinite(assignedBaselineEntry.playerCount)
            ? assignedBaselineEntry.playerCount
            : 0;

        const currentCount = (() => {
            const entry = findCityEntry(latestSnapshot, assignedCityId);
            return entry && Number.isFinite(entry.playerCount) ? entry.playerCount : 0;
        })();
        if (currentCount !== baselineCount + 1) {
            await waitForCityCount(socket, assignedCityId, (count) => {
                latestSnapshot = latestSnapshot || {};
                return count === baselineCount + 1;
            }, 10000);
        }

        socket.emit("lobby:leave", JSON.stringify({ reason: "test_leave" }));

        const afterLeaveCount = (() => {
            const entry = findCityEntry(latestSnapshot, assignedCityId);
            return entry && Number.isFinite(entry.playerCount) ? entry.playerCount : 0;
        })();
        if (afterLeaveCount !== baselineCount) {
            await waitForCityCount(socket, assignedCityId, (count) => {
                return count === baselineCount;
            }, 10000);
        }

        socket.disconnect();
    } finally {
        socket.removeAllListeners();
        socket.disconnect();
    }
});

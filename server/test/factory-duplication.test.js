"use strict";

const assert = require("assert");
const { test, beforeEach, afterEach } = require("node:test");
const { fork } = require("child_process");
const { clearTimeout, setTimeout } = require("timers");
const { setTimeout: delay } = require("timers/promises");
const { io } = require("socket.io-client");
const path = require("path");

let serverProcess = null;
let port = null;

const startServer = async () => {
    console.log("starting server");
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

beforeEach(async () => {
    await startServer();
});

afterEach(async () => {
    if (serverProcess) {
        serverProcess.kill();
        await new Promise((resolve) => serverProcess.once("exit", resolve));
        serverProcess = null;
        port = null;
    }
});

test("Factory icon pickup decrements stock to prevent double collect", async () => {
    try {
        console.log("connect socket");
        const socket = io(`http://127.0.0.1:${port}`, {
            transports: ["websocket"],
            forceNew: true,
            reconnection: false
        });

        const assignment = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("assignment timeout")), 8000);
            socket.on("lobby:assignment", (payload) => {
                clearTimeout(timer);
                resolve(JSON.parse(payload));
            });
            socket.on("connect", () => {
                console.log("socket connected, requesting assignment");
                socket.emit("enter_game", JSON.stringify({ desiredCity: 0 }));
            });
            socket.on("connect_error", reject);
        });
        assert(assignment && Number.isFinite(assignment.city));
        console.log("got assignment", assignment);

        const buildingResp = await fetch(`http://127.0.0.1:${port}/test/building`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: 109,
                x: 5,
                y: 5,
                cityId: assignment.city,
                itemsLeft: 0
            })
        });
        const buildingData = await buildingResp.json();
        const buildingId = buildingData?.building?.id;
        assert(buildingId, "Factory was not created");

        await fetch(`http://127.0.0.1:${port}/test/factory/produce`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ buildingId, itemType: 9, quantity: 1 })
        });
        console.log("produced factory icon");

        const iconId = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("icon timeout")), 8000);
            socket.on("new_icon", (payload) => {
                const data = JSON.parse(payload);
                if (data.buildingId === buildingId) {
                    clearTimeout(timer);
                    resolve(data.id);
                }
            });
            socket.on("connect_error", reject);
        });
        console.log("received icon", iconId);

        socket.emit("icon:pickup", JSON.stringify({ id: iconId }));
        await delay(200);

        await fetch(`http://127.0.0.1:${port}/test/factory/pickup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Socket-Id": socket.id
            },
            body: JSON.stringify({ buildingId, type: 9, quantity: 1 })
        });

        const finalResp = await fetch(`http://127.0.0.1:${port}/test/building/${encodeURIComponent(buildingId)}`);
        const finalData = await finalResp.json();
        const itemsLeft = finalData?.building?.itemsLeft;
        assert.strictEqual(itemsLeft, 0, "Factory stock was not decremented on icon pickup");

        socket.disconnect();
    } catch (error) {
        console.error("factory-duplication failure", error);
        throw error;
    }
});

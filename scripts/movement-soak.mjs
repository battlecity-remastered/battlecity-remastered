#!/usr/bin/env node
/**
 * Synthetic movement soak: boots the server in TEST_MODE on a random port,
 * spawns multiple socket.io clients, drives them in a simple pattern, and
 * reports any authoritative rejections / snapbacks along with ping stats.
 *
 * Usage:
 *   node scripts/movement-soak.mjs [--clients 10] [--duration 15000]
 */

import { fork } from "child_process";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { io as createIo } from "../bot/node_modules/socket.io-client/build/cjs/index.js";
import { readFileSync } from "fs";

const DEFAULT_CLIENTS = 10;
const DEFAULT_DURATION_MS = 15000;
const SEND_INTERVAL_MS = 33; // ~30 Hz
const TURN_INTERVAL_MS = 2000; // switch desired heading periodically
const MOVE_DISTANCE = 48 * 200; // drive ~200 tiles before wrap
const MAX_TURN_DELTA = 4; // mirrors PlayerStateValidator maxTurnDelta
const SNAP_THRESHOLD = 24; // pixels: consider as snapback if server differs more than half a tile
const MAP_MAX_PX = 511 * 48; // stay inside map bounds
const TILE_SIZE = 48;
const MAP_SIZE = 512;

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
    const index = args.indexOf(flag);
    if (index >= 0 && index + 1 < args.length) {
        const value = Number(args[index + 1]);
        return Number.isFinite(value) ? value : fallback;
    }
    return fallback;
};

const clientCount = getArg("--clients", DEFAULT_CLIENTS);
const durationMs = getArg("--duration", DEFAULT_DURATION_MS);

const basePort = 20000;
const randomOffset = Math.floor(Math.random() * 1000);
const serverPort = basePort + randomOffset;
const serverEnv = {
    ...process.env,
    PORT: String(serverPort),
    TEST_MODE: "true",
    CLIENT_ORIGINS: "*",
    SERVER_DISABLE_FAKE_CITIES: "true"
};

const serverProcess = fork(path.join(process.cwd(), "server", "app.js"), [], {
    cwd: path.join(process.cwd(), "server"),
    env: serverEnv,
    stdio: "pipe"
});

const waitForHealth = async (port, timeoutMs = 10000) => {
    const deadline = Date.now() + timeoutMs;
    const url = `http://127.0.0.1:${port}/health`;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return true;
            }
        } catch {
            // retry
        }
        await delay(200);
    }
    return false;
};

const shutdown = async () => {
    serverProcess.kill();
    await new Promise((resolve) => {
        serverProcess.once("exit", resolve);
        setTimeout(resolve, 2000);
    });
};

const citySpawns = JSON.parse(readFileSync(path.join(process.cwd(), "shared", "citySpawns.json")));
const mapData = loadMap();

const createClient = (index, port) => {
    const socket = createIo(`http://127.0.0.1:${port}`, {
        transports: ["websocket"],
        forceNew: true,
        timeout: 5000,
        reconnection: false
    });

    const stats = {
        id: null,
        rejections: 0,
        rejectionReasons: new Map(),
        snapbacks: 0,
        snapDistanceMax: 0,
        snapDistanceSum: 0,
        snapDistanceCount: 0,
        snapEvents: [],
        pingSamples: [],
        lastPingSentAt: null,
        lastOffset: { x: 0, y: 0 },
        lastSentOffset: { x: 0, y: 0 },
        sequence: 0,
        direction: 0,
        desiredDirection: 0
    };

    const sendPing = () => {
        stats.lastPingSentAt = performance.now();
        socket.emit("ping");
    };

    socket.on("pong", () => {
        if (stats.lastPingSentAt !== null) {
            const now = performance.now();
            stats.pingSamples.push(now - stats.lastPingSentAt);
        }
    });

    const recordRejection = (payload) => {
        stats.rejections += 1;
        const reasons = Array.isArray(payload?.reasons) ? payload.reasons : [];
        reasons.forEach((reason) => {
            const current = stats.rejectionReasons.get(reason) || 0;
            stats.rejectionReasons.set(reason, current + 1);
        });
    };

    socket.on("player:rejected", (payload) => {
        try {
            const data = typeof payload === "string" ? JSON.parse(payload) : payload;
            recordRejection(data);
        } catch {
            // ignore parse errors
        }
    });

    const clampDirectionStep = (current, desired) => {
        const modulo = 32;
        const normalise = (dir) => ((Math.round(dir) % modulo) + modulo) % modulo;
        const cur = normalise(current);
        const tgt = normalise(desired);
        const forward = ((tgt - cur + modulo) % modulo);
        const backward = ((cur - tgt + modulo) % modulo);
        let delta = 0;
        if (forward <= backward) {
            delta = Math.min(MAX_TURN_DELTA, forward);
        } else {
            delta = -Math.min(MAX_TURN_DELTA, backward);
        }
        return normalise(cur + delta);
    };

    const clampToMap = (value) => Math.min(MAP_MAX_PX, Math.max(0, value));

    const driveLoop = () => {
        const now = performance.now();
        const shouldTurn = !stats.lastTurnAt || (now - stats.lastTurnAt) >= TURN_INTERVAL_MS;
        if (shouldTurn) {
            stats.desiredDirection = (stats.desiredDirection === 0 ? 8 : 0);
            if (shouldTurn) {
                stats.lastTurnAt = now;
            }
        }

        stats.direction = clampDirectionStep(stats.direction, stats.desiredDirection);

        const distance = 0.6 * SEND_INTERVAL_MS;
        let nextX = stats.lastOffset.x + (stats.direction === 8 ? distance : 0);
        let nextY = stats.lastOffset.y + (stats.direction === 0 ? distance : 0);

        // Stay within a reasonable window to avoid map-edge clamps dominating the signal.
        nextX = clampToMap(nextX);
        nextY = clampToMap(nextY);

        stats.sequence += 1;
        const payload = {
            id: stats.id,
            city: 0,
            isMayor: false,
            health: 40,
            direction: stats.direction,
            isTurning: 0,
            isMoving: 1,
            sequence: stats.sequence,
            offset: { x: nextX, y: nextY }
        };
        socket.emit("player", JSON.stringify(payload));
        stats.lastOffset = { x: nextX, y: nextY };
        stats.lastSentOffset = { x: nextX, y: nextY };
        stats.lastDriveAt = now;
    };

    const startDriving = () => {
        stats.driveTimer = setInterval(driveLoop, SEND_INTERVAL_MS);
        stats.pingTimer = setInterval(sendPing, 1000);
    };

    const stopDriving = () => {
        clearInterval(stats.driveTimer);
        clearInterval(stats.pingTimer);
    };

    const enterGame = () => {
        const spawn = citySpawns["0"];
        const spawnPx = spawn
            ? { x: (spawn.tileX * TILE_SIZE) + (TILE_SIZE / 2), y: (spawn.tileY * TILE_SIZE) + (TILE_SIZE / 2) }
            : { x: TILE_SIZE / 2, y: TILE_SIZE / 2 };
        const spawnTileX = Math.floor(spawnPx.x / TILE_SIZE);
        const spawnTileY = Math.floor(spawnPx.y / TILE_SIZE);
        const corridor = findCorridor(mapData, spawnTileX, spawnTileY, 100);
        if (corridor) {
            stats.corridorY = corridor.tileY * TILE_SIZE;
            stats.direction = corridor.dir === 0 ? 0 : 8;
            stats.desiredDirection = stats.direction;
            stats.lastOffset = { x: spawnPx.x, y: stats.corridorY };
            stats.lastSentOffset = { x: spawnPx.x, y: stats.corridorY };
        }
        const payload = {
            id: null,
            city: 0,
            isMayor: false,
            direction: 0,
            isMoving: 0,
            offset: stats.lastOffset,
            sequence: 0
        };
        socket.emit("enter_game", JSON.stringify(payload));
    };

    socket.on("connect", () => {
        stats.id = socket.id;
        enterGame();
    });

    socket.on("player", (payload) => {
        const data = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (!data || data.id !== socket.id) {
            return;
        }
        if (stats.sequence === 0) {
            startDriving();
        }
        if (data.offset) {
            // Force Y to corridor to reduce incidental collisions.
            stats.lastOffset.y = stats.corridorY ?? stats.lastOffset.y;
            const dx = (data.offset.x ?? 0) - (stats.lastSentOffset.x ?? 0);
            const dy = (data.offset.y ?? 0) - (stats.lastSentOffset.y ?? 0);
            const distance = Math.sqrt((dx * dx) + (dy * dy));
            if (distance > SNAP_THRESHOLD) {
                stats.snapbacks += 1;
                stats.snapDistanceMax = Math.max(stats.snapDistanceMax, distance);
                stats.snapDistanceSum += distance;
                stats.snapDistanceCount += 1;
                const toTile = (coord) => Math.floor((coord || 0) / TILE_SIZE);
                stats.snapEvents.push({
                    sent: { x: stats.lastSentOffset.x, y: stats.lastSentOffset.y, tileX: toTile(stats.lastSentOffset.x), tileY: toTile(stats.lastSentOffset.y) },
                    got: { x: data.offset.x ?? 0, y: data.offset.y ?? 0, tileX: toTile(data.offset.x ?? 0), tileY: toTile(data.offset.y ?? 0) },
                    distance: Number(distance.toFixed(2))
                });
            }
        }
    });

    socket.on("disconnect", () => {
        stopDriving();
    });

    return { socket, stats, stop: stopDriving };
};

const summarise = (clients) => {
    const summary = clients.map(({ stats }) => {
        const pings = stats.pingSamples;
        const pingAvg = pings.length ? (pings.reduce((a, b) => a + b, 0) / pings.length) : null;
        const snapAvg = stats.snapDistanceCount
            ? Number((stats.snapDistanceSum / stats.snapDistanceCount).toFixed(2))
            : null;
        return {
            id: stats.id,
            rejections: stats.rejections,
            rejectionReasons: Object.fromEntries(stats.rejectionReasons),
            pingAvg: pingAvg !== null ? Number(pingAvg.toFixed(2)) : null,
            pingCount: pings.length,
            snapbacks: stats.snapbacks,
            snapDistanceMax: Number(stats.snapDistanceMax.toFixed(2)),
            snapDistanceAvg: snapAvg,
            snapEvents: stats.snapEvents
        };
    });
    return summary;
};

const main = async () => {
    const healthy = await waitForHealth(serverPort);
    if (!healthy) {
        console.error("Server failed to start");
        await shutdown();
        process.exit(1);
    }

    const clients = [];
    for (let i = 0; i < clientCount; i += 1) {
        clients.push(createClient(i, serverPort));
        await delay(50); // stagger connects slightly
    }

    await delay(durationMs);

    clients.forEach(({ socket, stop }) => {
        stop();
        socket.disconnect();
    });

    await shutdown();

    const summary = summarise(clients);
    console.log("Movement soak summary:", JSON.stringify(summary, null, 2));
};

main().catch(async (error) => {
    console.error("Soak test failed:", error);
    await shutdown();
    process.exit(1);
});
function loadMap() {
    const mapPath = path.join(process.cwd(), "client", "data", "map.dat");
    const buffer = readFileSync(mapPath);
    const map = Array.from({ length: MAP_SIZE }, () => new Array(MAP_SIZE).fill(0));
    const view = new Uint8Array(buffer);
    for (let x = 0; x < MAP_SIZE; x += 1) {
        for (let y = 0; y < MAP_SIZE; y += 1) {
            const sourceX = (MAP_SIZE - 1) - y;
            const sourceY = (MAP_SIZE - 1) - x;
            const index = sourceX + (sourceY * MAP_SIZE);
            map[x][y] = view[index] ?? 0;
        }
    }
    return map;
}

const findCorridor = (map, startTileX, startTileY, lengthTiles = 80) => {
    const isPassable = (x, y) => {
        if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) {
            return false;
        }
        const tile = map[x][y];
        return tile === 0 || tile === 3; // match client passable tiles
    };
    // Try to walk east along the row; if blocked, nudge downwards until we find a clear row.
    for (let dy = 0; dy < 10; dy += 1) {
        const row = startTileY + dy;
        let clear = true;
        for (let dx = 0; dx < lengthTiles; dx += 1) {
            if (!isPassable(startTileX + dx, row)) {
                clear = false;
                break;
            }
        }
        if (clear) {
            return { tileY: row, dir: 0 }; // 0 = south in our heading scheme
        }
    }
    // Fallback: walk south from the row
    return { tileY: startTileY, dir: 0 };
};

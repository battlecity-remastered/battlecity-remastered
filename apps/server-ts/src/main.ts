import express, { type Request, type Response } from "express";
import http from "node:http";
import { Server } from "socket.io";
import { Schema } from "@effect/schema";
import { Effect } from "effect";
import {
    BuildingDemolished as BuildingDemolishedSchema,
    BuildingPlaceRequest as BuildingPlaceRequestSchema,
    BuildingPlaced as BuildingPlacedSchema,
    BulletFireRequest as BulletFireRequestSchema,
    BulletFired as BulletFiredSchema,
    BulletResolved as BulletResolvedSchema,
    type EventEnvelope,
    EventEnvelope as EventEnvelopeSchema,
    LobbyAssignment as LobbyAssignmentSchema,
    LobbyJoinRequest as LobbyJoinRequestSchema,
    makeEnvelope,
    PlayerDead as PlayerDeadSchema,
    PlayerHealthUpdate as PlayerHealthUpdateSchema,
    PlayerUpdate as PlayerUpdateSchema
} from "@battlecity/protocol";
import {
    advancePlayer,
    stepBulletAndResolve,
    type BulletState,
    type CombatBuildingState,
    type CombatPlayerState,
    type PlayerState
} from "@battlecity/sim-core";

type RuntimePlayer = PlayerState & {
    city: number;
    health: number;
    maxHealth: number;
};

type RuntimeBuilding = CombatBuildingState & {
    ownerId: string;
    type: number;
};

type RuntimeState = {
    players: Map<string, RuntimePlayer>;
    bullets: Map<string, BulletState>;
    buildings: Map<string, RuntimeBuilding>;
    socketCities: Map<string, number>;
    socketRoles: Map<string, "mayor" | "recruit">;
    seq: number;
};

const state: RuntimeState = {
    players: new Map(),
    bullets: new Map(),
    buildings: new Map(),
    socketCities: new Map(),
    socketRoles: new Map(),
    seq: 0
};

const decodeEnvelope = Schema.decodeUnknownEither(EventEnvelopeSchema);
const decodeBuildingPlaceRequest = Schema.decodeUnknownEither(BuildingPlaceRequestSchema);
const decodeBulletFireRequest = Schema.decodeUnknownEither(BulletFireRequestSchema);
const decodeBulletFired = Schema.decodeUnknownEither(BulletFiredSchema);
const decodeBulletResolved = Schema.decodeUnknownEither(BulletResolvedSchema);
const decodeLobbyJoin = Schema.decodeUnknownEither(LobbyJoinRequestSchema);
const decodeLobbyAssignment = Schema.decodeUnknownEither(LobbyAssignmentSchema);
const decodeBuildingPlaced = Schema.decodeUnknownEither(BuildingPlacedSchema);
const decodeBuildingDemolished = Schema.decodeUnknownEither(BuildingDemolishedSchema);
const decodePlayerUpdate = Schema.decodeUnknownEither(PlayerUpdateSchema);
const decodePlayerHealth = Schema.decodeUnknownEither(PlayerHealthUpdateSchema);
const decodePlayerDead = Schema.decodeUnknownEither(PlayerDeadSchema);

const DEFAULT_CITY = 0;
const MAP_MAX = 24576;
const SERVER_STEP_MS = 33;
const BULLET_TICK_MS = 100;
const DEFAULT_BUILDING_HEALTH = 120;

const nextSeq = (): number => {
    state.seq += 1;
    return state.seq;
};

const normalizeDirection = (direction: number): number => {
    const wrapped = Math.floor(direction) % 32;
    return wrapped < 0 ? wrapped + 32 : wrapped;
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "server-ts" });
});

const buildSnapshot = () => {
    return Array.from(state.players.values()).map((player) => {
        return {
            id: player.id,
            city: player.city,
            direction: player.direction,
            offset: {
                x: player.x,
                y: player.y
            },
            health: player.health,
            maxHealth: player.maxHealth
        };
    });
};

const emitSnapshot = () => {
    io.emit("event", makeEnvelope("players.snapshot", nextSeq(), buildSnapshot()));
};

const emitBullet = (bullet: BulletState) => {
    const payload = {
        id: bullet.id,
        ownerId: bullet.ownerId,
        city: bullet.city,
        position: {
            x: bullet.x,
            y: bullet.y
        },
        direction: bullet.direction,
        type: bullet.type
    };
    const decoded = decodeBulletFired(payload);
    if (decoded._tag !== "Right") {
        return;
    }
    io.emit("event", makeEnvelope("bullet.fired", nextSeq(), decoded.right));
};

const emitBulletResolved = (
    bulletId: string,
    reason: "out_of_bounds" | "hit_player" | "hit_building",
    hitPlayerId?: string,
    hitBuildingId?: string
) => {
    const decoded = decodeBulletResolved({ id: bulletId, reason, hitPlayerId, hitBuildingId });
    if (decoded._tag !== "Right") {
        return;
    }
    io.emit("event", makeEnvelope("bullet.resolved", nextSeq(), decoded.right));
};

const emitPlayerHealth = (id: string, health: number, maxHealth: number, source?: string) => {
    const decoded = decodePlayerHealth({ id, health, maxHealth, source });
    if (decoded._tag !== "Right") {
        return;
    }
    io.emit("event", makeEnvelope("player.health", nextSeq(), decoded.right));
};

const emitPlayerDead = (id: string, by?: string) => {
    const decoded = decodePlayerDead({ id, by });
    if (decoded._tag !== "Right") {
        return;
    }
    io.emit("event", makeEnvelope("player.dead", nextSeq(), decoded.right));
};

const emitBuildingPlaced = (building: RuntimeBuilding) => {
    const decoded = decodeBuildingPlaced(building);
    if (decoded._tag !== "Right") {
        return;
    }
    io.emit("event", makeEnvelope("building.placed", nextSeq(), decoded.right));
};

const emitBuildingDemolished = (id: string, cityId: number) => {
    const decoded = decodeBuildingDemolished({ id, cityId });
    if (decoded._tag !== "Right") {
        return;
    }
    io.emit("event", makeEnvelope("building.demolished", nextSeq(), decoded.right));
};

const removeOwnedBullets = (ownerId: string): void => {
    for (const [bulletId, bullet] of state.bullets.entries()) {
        if (bullet.ownerId === ownerId) {
            state.bullets.delete(bulletId);
            emitBulletResolved(bulletId, "out_of_bounds");
        }
    }
};

const removePlayer = (playerId: string): void => {
    state.players.delete(playerId);
    removeOwnedBullets(playerId);
};

const assignPlayer = (socketId: string, desiredCity?: number) => {
    const city = (typeof desiredCity === "number" && Number.isFinite(desiredCity))
        ? Math.max(0, Math.floor(desiredCity))
        : DEFAULT_CITY;
    const role = "recruit" as const;
    state.socketCities.set(socketId, city);
    state.socketRoles.set(socketId, role);

    const assignment = {
        id: socketId,
        city,
        role
    };
    const decoded = decodeLobbyAssignment(assignment);
    if (decoded._tag === "Right") {
        io.to(socketId).emit("event", makeEnvelope("lobby.assignment", nextSeq(), decoded.right));
    }
};

const handlePlayerUpdate = (socketId: string, envelope: EventEnvelope): void => {
    if (envelope.type !== "player.update") {
        return;
    }

    const parsed = decodePlayerUpdate(envelope.payload);
    if (parsed._tag !== "Right") {
        return;
    }

    const city = state.socketCities.get(socketId) ?? parsed.right.city ?? DEFAULT_CITY;
    state.socketCities.set(socketId, city);

    const current = state.players.get(socketId) ?? {
        id: socketId,
        city,
        x: parsed.right.offset.x,
        y: parsed.right.offset.y,
        direction: normalizeDirection(parsed.right.direction),
        speed: 300,
        health: 100,
        maxHealth: 100
    };

    const withDirection: RuntimePlayer = {
        ...current,
        city,
        direction: normalizeDirection(parsed.right.direction)
    };

    const next = parsed.right.isMoving
        ? {
            ...advancePlayer(withDirection, SERVER_STEP_MS, MAP_MAX, MAP_MAX),
            city,
            health: current.health,
            maxHealth: current.maxHealth
        }
        : withDirection;

    state.players.set(socketId, next);
    emitSnapshot();
};

const handleBulletFire = (socketId: string, envelope: EventEnvelope): void => {
    if (envelope.type !== "bullet.fire.request") {
        return;
    }
    const parsed = decodeBulletFireRequest(envelope.payload);
    if (parsed._tag !== "Right") {
        return;
    }

    const player = state.players.get(socketId);
    if (!player) {
        return;
    }

    const next: BulletState = {
        id: `bullet_${nextSeq()}`,
        ownerId: socketId,
        city: player.city,
        x: player.x,
        y: player.y,
        direction: player.direction,
        speed: 900,
        type: parsed.right.type
    };
    state.bullets.set(next.id, next);
    emitBullet(next);
};

const handleBuildingPlace = (socketId: string, envelope: EventEnvelope): void => {
    if (envelope.type !== "building.place.request") {
        return;
    }
    const parsed = decodeBuildingPlaceRequest(envelope.payload);
    if (parsed._tag !== "Right") {
        return;
    }

    const city = state.socketCities.get(socketId);
    if (city === undefined || city !== parsed.right.cityId) {
        return;
    }

    const tileX = Math.max(0, Math.floor(parsed.right.tileX));
    const tileY = Math.max(0, Math.floor(parsed.right.tileY));
    const id = `building_${nextSeq()}`;
    const building: RuntimeBuilding = {
        id,
        ownerId: socketId,
        cityId: city,
        type: parsed.right.type,
        tileX,
        tileY,
        health: DEFAULT_BUILDING_HEALTH,
        maxHealth: DEFAULT_BUILDING_HEALTH
    };
    state.buildings.set(id, building);
    emitBuildingPlaced(building);
};

const handleLobbyJoin = (socketId: string, envelope: EventEnvelope): void => {
    if (envelope.type !== "lobby.join.request") {
        return;
    }
    const parsed = decodeLobbyJoin(envelope.payload);
    if (parsed._tag !== "Right") {
        return;
    }
    assignPlayer(socketId, parsed.right.desiredCity);
    emitSnapshot();
};

const tickBullets = (): void => {
    let snapshotDirty = false;
    for (const [bulletId, bullet] of state.bullets.entries()) {
        const result = stepBulletAndResolve(
            bullet,
            BULLET_TICK_MS,
            MAP_MAX,
            MAP_MAX,
            state.players.values() as Iterable<CombatPlayerState>,
            state.buildings.values() as Iterable<CombatBuildingState>
        );

        if (result.kind === "none") {
            state.bullets.set(bulletId, result.bullet);
            continue;
        }

        state.bullets.delete(bulletId);

        if (result.kind === "out_of_bounds") {
            emitBulletResolved(bulletId, "out_of_bounds");
            continue;
        }

        if (result.kind === "hit_player") {
            emitBulletResolved(bulletId, "hit_player", result.playerId);
            const player = state.players.get(result.playerId);
            if (!player) {
                continue;
            }
            const nextPlayer = {
                ...player,
                health: result.nextHealth
            };
            emitPlayerHealth(nextPlayer.id, nextPlayer.health, nextPlayer.maxHealth, "bullet");
            if (result.isDead) {
                emitPlayerDead(nextPlayer.id, bullet.ownerId);
                removePlayer(nextPlayer.id);
                snapshotDirty = true;
            } else {
                state.players.set(nextPlayer.id, nextPlayer);
            }
            continue;
        }

        emitBulletResolved(bulletId, "hit_building", undefined, result.buildingId);
        const building = state.buildings.get(result.buildingId);
        if (!building) {
            continue;
        }
        if (result.isDemolished) {
            state.buildings.delete(building.id);
            emitBuildingDemolished(building.id, building.cityId);
        } else {
            state.buildings.set(building.id, {
                ...building,
                health: result.nextHealth
            });
        }
    }

    if (snapshotDirty) {
        emitSnapshot();
    }
};

io.on("connection", (socket) => {
    socket.on("event", (raw: unknown) => {
        const decoded = decodeEnvelope(raw);
        if (decoded._tag !== "Right") {
            socket.emit("event:rejected", { reason: "invalid_envelope" });
            return;
        }
        handleLobbyJoin(socket.id, decoded.right);
        handlePlayerUpdate(socket.id, decoded.right);
        handleBulletFire(socket.id, decoded.right);
        handleBuildingPlace(socket.id, decoded.right);
    });

    socket.on("disconnect", () => {
        state.socketCities.delete(socket.id);
        state.socketRoles.delete(socket.id);
        removePlayer(socket.id);
        emitSnapshot();
    });
});

setInterval(tickBullets, BULLET_TICK_MS);

const startServer = Effect.promise(() => {
    return new Promise<void>((resolve, reject) => {
        const port = Number(process.env.PORT || 8121);
        const onError = (error: Error) => {
            reject(error);
        };

        server.once("error", onError);
        server.listen(port, () => {
            server.off("error", onError);
            console.log(`[server-ts] listening on :${port}`);
            resolve();
        });
    });
});

Effect.runPromise(startServer).catch((error) => {
    console.error(error);
    process.exit(1);
});

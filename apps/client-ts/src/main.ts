import { Application } from "pixi.js";
import { io } from "socket.io-client";
import { Schema } from "@effect/schema";
import {
    EventEnvelope as EventEnvelopeSchema,
    makeEnvelope,
    type EventEnvelope
} from "@battlecity/protocol";

const decodeEnvelope = Schema.decodeUnknownEither(EventEnvelopeSchema);
let seq = 0;
const nextSeq = () => {
    seq += 1;
    return seq;
};

const state = {
    id: null as string | null,
    city: 0,
    direction: 0,
    x: 128,
    y: 128,
    health: 100,
    maxHealth: 100,
    lastShotAt: 0,
    placedInitialBuilding: false
};

const app = new Application();
await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: "#09151f",
    antialias: false
});

const root = document.getElementById("app");
if (root) {
    root.appendChild(app.canvas);
}

const socket = io("http://localhost:8121", {
    transports: ["websocket"]
});

const sendEvent = (type: EventEnvelope["type"], payload: unknown) => {
    socket.emit("event", makeEnvelope(type, nextSeq(), payload));
};

socket.on("connect", () => {
    sendEvent("lobby.join.request", { desiredCity: 0 });
});

setInterval(() => {
    if (!state.id) {
        return;
    }
    state.direction = (state.direction + 1) % 32;
    sendEvent("player.update", {
        id: state.id,
        city: state.city,
        direction: state.direction,
        isMoving: true,
        offset: { x: state.x, y: state.y }
    });

    const now = Date.now();
    if (now - state.lastShotAt > 1000) {
        state.lastShotAt = now;
        sendEvent("bullet.fire.request", {
            ownerId: state.id,
            position: { x: state.x, y: state.y },
            direction: state.direction,
            type: 0
        });
    }

    if (!state.placedInitialBuilding) {
        state.placedInitialBuilding = true;
        sendEvent("building.place.request", {
            ownerId: state.id,
            cityId: state.city,
            type: 109,
            tileX: 10,
            tileY: 10
        });
    }
}, 100);

socket.on("event", (payload: unknown) => {
    const decoded = decodeEnvelope(payload);
    if (decoded._tag !== "Right") {
        return;
    }

    if (decoded.right.type === "lobby.assignment") {
        const assignment = decoded.right.payload as { id: string; city: number };
        state.id = assignment.id;
        state.city = assignment.city;
    } else if (decoded.right.type === "players.snapshot") {
        const players = decoded.right.payload as Array<{
            id: string;
            city: number;
            direction: number;
            offset: { x: number; y: number };
            health?: number;
            maxHealth?: number;
        }>;
        const mine = players.find((player) => player.id === state.id);
        if (mine) {
            state.x = mine.offset.x;
            state.y = mine.offset.y;
            if (typeof mine.health === "number") {
                state.health = mine.health;
            }
            if (typeof mine.maxHealth === "number") {
                state.maxHealth = mine.maxHealth;
            }
        }
    } else if (decoded.right.type === "bullet.fired") {
        const bullet = decoded.right.payload as {
            id: string;
            ownerId: string;
            position: { x: number; y: number };
        };
        console.log("[client-ts] bullet fired", bullet.id, bullet.ownerId, bullet.position.x, bullet.position.y);
    } else if (decoded.right.type === "bullet.resolved") {
        const bullet = decoded.right.payload as {
            id: string;
            reason: "out_of_bounds" | "hit_player" | "hit_building";
            hitPlayerId?: string;
            hitBuildingId?: string;
        };
        console.log("[client-ts] bullet resolved", bullet.id, bullet.reason, bullet.hitPlayerId, bullet.hitBuildingId);
    } else if (decoded.right.type === "player.health") {
        const health = decoded.right.payload as {
            id: string;
            health: number;
            maxHealth: number;
            source?: string;
        };
        if (health.id === state.id) {
            state.health = health.health;
            state.maxHealth = health.maxHealth;
        }
        console.log("[client-ts] health", health.id, health.health, health.maxHealth, health.source ?? "");
    } else if (decoded.right.type === "player.dead") {
        const dead = decoded.right.payload as { id: string; by?: string };
        console.log("[client-ts] dead", dead.id, dead.by ?? "");
    } else if (decoded.right.type === "building.placed") {
        const building = decoded.right.payload as {
            id: string;
            ownerId: string;
            type: number;
            tileX: number;
            tileY: number;
            health: number;
            maxHealth: number;
        };
        console.log(
            "[client-ts] building placed",
            building.id,
            building.ownerId,
            building.type,
            building.tileX,
            building.tileY,
            building.health,
            building.maxHealth
        );
    } else if (decoded.right.type === "building.demolished") {
        const building = decoded.right.payload as { id: string; cityId: number };
        console.log("[client-ts] building demolished", building.id, building.cityId);
    }
});

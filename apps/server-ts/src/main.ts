import express, { type Request, type Response } from "express";
import http from "node:http";
import { Server } from "socket.io";
import { Schema } from "@effect/schema";
import { Effect } from "effect";
import {
    type EventEnvelope,
    EventEnvelope as EventEnvelopeSchema,
    PlayerUpdate as PlayerUpdateSchema
} from "@battlecity/protocol";
import { advancePlayer, type PlayerState } from "@battlecity/sim-core";

type RuntimeState = {
    players: Map<string, PlayerState>;
};

const state: RuntimeState = {
    players: new Map()
};

const decodeEnvelope = Schema.decodeUnknownEither(EventEnvelopeSchema);
const decodePlayerUpdate = Schema.decodeUnknownEither(PlayerUpdateSchema);

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

const handlePlayerUpdate = (envelope: EventEnvelope): void => {
    if (envelope.type !== "player.update") {
        return;
    }

    const parsed = decodePlayerUpdate(envelope.payload);
    if (parsed._tag !== "Right") {
        return;
    }

    const player = parsed.right;
    const current = state.players.get(player.id) ?? {
        id: player.id,
        x: player.offset.x,
        y: player.offset.y,
        direction: player.direction,
        speed: 300
    };

    const next = advancePlayer(
        { ...current, direction: player.direction, x: player.offset.x, y: player.offset.y },
        33,
        24576,
        24576
    );
    state.players.set(next.id, next);
};

io.on("connection", (socket) => {
    socket.on("event", (raw: unknown) => {
        const decoded = decodeEnvelope(raw);
        if (decoded._tag !== "Right") {
            socket.emit("event:rejected", { reason: "invalid_envelope" });
            return;
        }
        handlePlayerUpdate(decoded.right);
    });
});

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

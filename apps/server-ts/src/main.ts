import express, { type Request, type Response } from "express";
import http from "node:http";
import { Server } from "socket.io";
import { Effect } from "effect";
import { GameRuntime } from "./runtime/GameRuntime.js";
import { DEFAULT_RUNTIME_CONFIG } from "./runtime/types.js";
import { RuntimeScope } from "./runtime/RuntimeScope.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const runtime = new GameRuntime({
    emitAll: (event) => {
        io.emit("event", event);
    },
    emitTo: (socketId, event) => {
        io.to(socketId).emit("event", event);
    },
    reject: (socketId, reason) => {
        io.to(socketId).emit("event:rejected", { reason });
    }
});
const runtimeScope = RuntimeScope.open(runtime, DEFAULT_RUNTIME_CONFIG);

app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "server-ts" });
});

io.on("connection", (socket) => {
    socket.on("event", (raw: unknown) => {
        runtimeScope.onSocketEvent(socket.id, raw);
    });

    socket.on("disconnect", () => {
        runtimeScope.onSocketDisconnect(runtime, socket.id);
    });
});

const shutdown = () => {
    runtimeScope.close().catch((error) => {
        console.error("[server-ts] shutdown error", error);
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

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

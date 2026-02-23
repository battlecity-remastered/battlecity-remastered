import express, { type Request, type Response } from "express";
import http from "node:http";
import { Server } from "socket.io";
import { makeEnvelope } from "@battlecity/protocol";
import { Effect } from "effect";
import { buildRuntimeServices } from "./layers/RuntimeLayer.js";
import { logRuntime } from "./observability/RuntimeLogger.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const { runtime, runtimeScope } = buildRuntimeServices({
    emitAll: (event) => {
        io.emit("event", event);
    },
    emitTo: (socketId, event) => {
        io.to(socketId).emit("event", event);
    },
    reject: (socketId, reason) => {
        io.to(socketId).emit("event", makeEnvelope("event.rejected", 0, { reason }));
        io.to(socketId).emit("event:rejected", { reason });
    }
});

app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "server-ts" });
});

io.on("connection", (socket) => {
    Effect.runSync(logRuntime("info", "socket.connected", { socketId: socket.id }));
    socket.on("event", (raw: unknown) => {
        runtimeScope.onSocketEvent(socket.id, raw);
    });

    socket.on("disconnect", () => {
        Effect.runSync(logRuntime("info", "socket.disconnected", { socketId: socket.id }));
        runtimeScope.onSocketDisconnect(runtime, socket.id);
    });
});

const shutdown = () => {
    Effect.runSync(logRuntime("info", "runtime.shutdown.begin"));
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
            Effect.runSync(logRuntime("info", "runtime.listen", { port }));
            resolve();
        });
    });
});

Effect.runPromise(startServer).catch((error) => {
    console.error(error);
    process.exit(1);
});

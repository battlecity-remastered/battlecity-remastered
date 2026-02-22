import { Application } from "pixi.js";
import { io } from "socket.io-client";
import { Schema } from "@effect/schema";
import { EventEnvelope as EventEnvelopeSchema } from "@battlecity/protocol";

const decodeEnvelope = Schema.decodeUnknownEither(EventEnvelopeSchema);

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

socket.on("event", (payload: unknown) => {
    const decoded = decodeEnvelope(payload);
    if (decoded._tag !== "Right") {
        return;
    }
    // Event dispatching is intentionally thin here.
    // Gameplay integration comes in follow-up migrations by domain.
    console.log("[client-ts] event", decoded.right.type);
});

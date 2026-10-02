import express from "express";
import { fileURLToPath } from "node:url";
import { registerIdentityHttp, type IdentityHttpServices } from "./identity-http.js";

const DEFAULT_CLIENT_DIST = fileURLToPath(new URL("../../client-ts/dist/", import.meta.url));

// The container serves both the built battlefield and its authoritative protocol
// from the same origin, so the production client needs no separate Vite server.
export const createHttpApp = (clientDist = DEFAULT_CLIENT_DIST, identity?: IdentityHttpServices) => {
    const app = express();
    if (identity) registerIdentityHttp(app, identity);
    app.get("/health", (_req, res) => {
        res.json({ ok: true, service: "server-ts" });
    });
    app.use(express.static(clientDist, {
        setHeaders: (res, filePath) => {
            // Revalidate the entry page after a deploy; its bundle names change.
            if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
        }
    }));
    return app;
};

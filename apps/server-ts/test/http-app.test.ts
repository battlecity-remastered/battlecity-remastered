import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { createHttpApp } from "../src/http-app.js";

test("production HTTP serves the built game and assets alongside health", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "battlecity-http-"));
    const dist = path.join(root, "dist");
    await mkdir(path.join(dist, "assets", "models"), { recursive: true });
    await writeFile(path.join(dist, "index.html"), '<div id="app"></div><script type="module" src="/assets/game.js"></script>');
    await writeFile(path.join(dist, "assets", "game.js"), "window.battlecity = true;");
    await writeFile(path.join(dist, "assets", "models", "tank.glb"), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
    await writeFile(path.join(root, "scores.db"), "private database");
    const server = http.createServer(createHttpApp(dist));
    try {
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const origin = `http://127.0.0.1:${address.port}`;
        const health = await fetch(`${origin}/health`);
        assert.deepEqual(await health.json(), { ok: true, service: "server-ts" });
        for (const route of ["/", "/?demo=1"]) {
            const page = await fetch(origin + route);
            assert.equal(page.status, 200);
            assert.match(page.headers.get("content-type")!, /text\/html/);
            assert.equal(page.headers.get("cache-control"), "no-cache");
            assert.match(await page.text(), /id="app"/);
        }
        const bundle = await fetch(`${origin}/assets/game.js`);
        assert.equal(bundle.status, 200);
        assert.match(bundle.headers.get("content-type")!, /javascript/);
        const model = await fetch(`${origin}/assets/models/tank.glb`);
        assert.deepEqual(Buffer.from(await model.arrayBuffer()), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
        for (const route of ["/assets/missing.glb", "/scores.db", "/%2e%2e%2fscores.db"]) {
            assert.equal((await fetch(origin + route)).status, 404);
        }
    } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
        await rm(root, { recursive: true, force: true });
    }
});

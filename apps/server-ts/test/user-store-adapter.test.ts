import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Effect } from "effect";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";

const sqliteAvailable = (() => {
    try {
        execFileSync("sqlite3", ["-version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return true;
    } catch {
        return false;
    }
})();

const withTempDir = (fn: (dir: string) => void): void => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-user-store-"));
    try {
        fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
};

test("UserStoreAdapter can read/write classic player_scores schema", { skip: !sqliteAvailable }, () => {
    withTempDir((dir) => {
        const dbPath = path.join(dir, "scores.db");

        execFileSync("sqlite3", [dbPath, `
            CREATE TABLE player_scores (
                user_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                points INTEGER NOT NULL DEFAULT 0,
                orbs INTEGER NOT NULL DEFAULT 0,
                assists INTEGER NOT NULL DEFAULT 0,
                deaths INTEGER NOT NULL DEFAULT 0,
                kills INTEGER NOT NULL DEFAULT 0,
                rank_title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            INSERT INTO player_scores (user_id, display_name, provider, points, orbs, assists, deaths, kills, rank_title, created_at, updated_at)
            VALUES ('google:user-1', 'Pilot One', 'google', 32000, 3, 2, 0, 0, 'recruit', 1, 2);
        `], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

        const store = new UserStoreAdapter({
            dbPath,
            useSqlStorage: true
        });

        const existing = Effect.runSync(store.getOrCreate("google:user-1"));
        assert.equal(existing.score, 32000);
        assert.equal(existing.rank, "General");

        const updated = Effect.runSync(store.addScore("google:user-1", 250));
        assert.equal(updated.score, 32250);
        assert.equal(updated.rank, "General");
        assert.equal(updated.orbs, 4);

        const rowsRaw = execFileSync("sqlite3", [dbPath, "-cmd", ".mode json", "SELECT user_id AS userId, points, orbs, rank_title AS rankTitle FROM player_scores WHERE user_id='google:user-1';"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
        });
        const rows = JSON.parse(rowsRaw.trim()) as Array<{ userId: string; points: number; orbs: number; rankTitle: string }>;
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.points, 32250);
        assert.equal(rows[0]?.orbs, 4);
        assert.equal(rows[0]?.rankTitle, "General");
    });
});

test("UserStoreAdapter migrates missing classic columns safely", { skip: !sqliteAvailable }, () => {
    withTempDir((dir) => {
        const dbPath = path.join(dir, "scores.db");

        execFileSync("sqlite3", [dbPath, `
            CREATE TABLE player_scores (
                user_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                points INTEGER NOT NULL DEFAULT 0,
                rank_title TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

        const store = new UserStoreAdapter({
            dbPath,
            useSqlStorage: true
        });

        Effect.runSync(store.addScore("google:user-2", 100));

        const columnsRaw = execFileSync("sqlite3", [dbPath, "-cmd", ".mode json", "PRAGMA table_info(player_scores);"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
        });
        const columns = JSON.parse(columnsRaw.trim()) as Array<{ name: string }>;
        const names = new Set(columns.map((column) => column.name));
        assert.equal(names.has("orbs"), true);
        assert.equal(names.has("assists"), true);
        assert.equal(names.has("created_at"), true);
    });
});

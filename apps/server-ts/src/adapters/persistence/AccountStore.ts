import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { escapeValue, sanitizeDisplayName } from "./user-store-utils.js";

export type Account = { id: string; name: string; provider: "google" };
export class AccountStore {
    constructor(private readonly dbPath: string) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.query(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,
            provider_id TEXT NOT NULL, email TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`);
    }

    public googleAccount(sub: string, displayName?: string): Account {
        const lookup = `SELECT id, name, provider FROM users WHERE provider='google' AND provider_id=${escapeValue(sub)} LIMIT 1;`;
        const existing = this.query(lookup)[0] as Account | undefined;
        if (existing) return existing; // Keep the original UUID, callsign and all scores.
        const id = randomUUID(), now = Date.now();
        const baseName = sanitizeDisplayName(displayName, "Pilot").slice(0, 32);
        const taken = this.query(`SELECT id FROM users WHERE lower(name)=lower(${escapeValue(baseName)}) LIMIT 1;`).length > 0;
        const name = taken ? `${baseName.slice(0, 23)} ${id.slice(0, 8)}` : baseName;
        this.query(`INSERT INTO users (id,name,provider,provider_id,created_at,updated_at)
            VALUES (${escapeValue(id)},${escapeValue(name)},'google',${escapeValue(sub)},${now},${now});`);
        return { id, name, provider: "google" };
    }

    private query(sql: string): unknown[] {
        const raw = execFileSync(process.env.SQLITE3_PATH || "sqlite3", [this.dbPath, "-cmd", ".timeout 3000", "-json", sql],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
        return raw ? JSON.parse(raw) as unknown[] : [];
    }
}

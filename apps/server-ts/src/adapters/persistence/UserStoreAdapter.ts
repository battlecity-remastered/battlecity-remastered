import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { resolveRankTitle, clampToNonNegativeInt } from "../../domain/score/RankService.js";
import {
    compareRuntimeProfiles,
    escapeValue,
    parseBool,
    providerFromUserId,
    sanitizeDisplayName,
    sanitizeUserId
} from "./user-store-utils.js";

export type RuntimeUserProfile = {
    id: string;
    name: string;
    score: number;
    rank: string;
    orbs: number;
    assists: number;
    updatedAt: number;
};

type PersistedScoreRow = { userId?: string; displayName?: string; provider?: string; points?: number; orbs?: number; assists?: number; rankTitle?: string; createdAt?: number; updatedAt?: number; };
type UserStoreAdapterOptions = { dbPath?: string; sqliteBin?: string; useSqlStorage?: boolean; };

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(moduleDir, "../../../data/scores.db");
const LEGACY_DB_PATH = path.resolve(moduleDir, "../../../../server/data/scores.db");
const SQLITE_BIN = process.env.SQLITE3_PATH || "sqlite3";

export class UserStoreAdapter {
    private readonly users = new Map<string, RuntimeUserProfile>();
    private readonly sqliteBin: string;
    private readonly dbPath: string;
    private readonly sqlEnabled: boolean;

    constructor(options: UserStoreAdapterOptions = {}) {
        this.sqliteBin = options.sqliteBin || SQLITE_BIN;

        const envDbPath = process.env.BATTLECITY_SCORES_DB_PATH || process.env.SCORES_DB_PATH;
        const preferredPath = options.dbPath || envDbPath || DEFAULT_DB_PATH;
        const existingPath = [preferredPath, LEGACY_DB_PATH].find((candidate) => fs.existsSync(candidate));
        this.dbPath = existingPath || preferredPath;

        const explicitSqlToggle = options.useSqlStorage ?? parseBool(process.env.BATTLECITY_ENABLE_SQL_STORE);
        const shouldEnableSql = explicitSqlToggle ?? (existingPath !== undefined);

        if (shouldEnableSql && this.canUseSqlite()) {
            this.sqlEnabled = true;
            this.initialiseDatabase();
            this.loadFromDatabase();
        } else {
            this.sqlEnabled = false;
        }
    }

    public getOrCreate(userId: string, displayName?: string): Effect.Effect<RuntimeUserProfile> {
        return Effect.sync(() => {
            const normalizedUserId = sanitizeUserId(userId);
            const existing = this.users.get(normalizedUserId);
            if (existing) {
                const nextName = sanitizeDisplayName(displayName, existing.name);
                if (nextName === existing.name) {
                    return existing;
                }
                const updated = {
                    ...existing,
                    name: nextName,
                    updatedAt: Date.now()
                };
                this.users.set(normalizedUserId, updated);
                if (this.sqlEnabled) {
                    this.persistProfile(updated);
                }
                return updated;
            }

            const now = Date.now();
            const created: RuntimeUserProfile = {
                id: normalizedUserId,
                name: sanitizeDisplayName(displayName, normalizedUserId.slice(0, 12) || "Player"),
                score: 0,
                rank: resolveRankTitle(0),
                orbs: 0,
                assists: 0,
                updatedAt: now
            };
            this.users.set(normalizedUserId, created);
            if (this.sqlEnabled) {
                this.persistProfile(created);
            }
            return created;
        });
    }

    public addScore(userId: string, amount: number, displayName?: string): Effect.Effect<RuntimeUserProfile> {
        return Effect.sync(() => {
            const normalizedUserId = sanitizeUserId(userId);
            const now = Date.now();
            const existing = this.users.get(normalizedUserId) ?? {
                id: normalizedUserId,
                name: sanitizeDisplayName(displayName, normalizedUserId.slice(0, 12) || "Player"),
                score: 0,
                rank: resolveRankTitle(0),
                orbs: 0,
                assists: 0,
                updatedAt: now
            };

            const nextScore = Math.max(0, existing.score + Math.floor(amount));
            const nextName = sanitizeDisplayName(displayName, existing.name);
            const updated: RuntimeUserProfile = {
                id: normalizedUserId,
                name: nextName,
                score: nextScore,
                rank: resolveRankTitle(nextScore),
                orbs: existing.orbs + (amount > 0 ? 1 : 0),
                assists: existing.assists,
                updatedAt: now
            };
            this.users.set(normalizedUserId, updated);
            if (this.sqlEnabled) {
                this.persistProfile(updated);
            }
            return updated;
        });
    }

    public listTop(limit = 20): Effect.Effect<RuntimeUserProfile[]> {
        return Effect.sync(() => {
            const boundedLimit = Number.isFinite(limit)
                ? Math.max(1, Math.min(100, Math.floor(limit)))
                : 20;

            return Array.from(this.users.values())
                .sort(compareRuntimeProfiles)
                .slice(0, boundedLimit);
        });
    }

    private canUseSqlite(): boolean {
        try {
            execFileSync(this.sqliteBin, ["-version"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"]
            });
            return true;
        } catch {
            return false;
        }
    }

    private initialiseDatabase(): void {
        const directory = path.dirname(this.dbPath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        const schema = `
            CREATE TABLE IF NOT EXISTS player_scores (
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
            CREATE INDEX IF NOT EXISTS idx_player_scores_points
                ON player_scores(points DESC, updated_at ASC);
        `;
        this.execute(schema);

        const rows = this.query("PRAGMA table_info(player_scores);");
        const existingColumns = new Set(
            rows
                .map((row) => (row as { name?: unknown }).name)
                .filter((name): name is string => typeof name === "string")
        );

        const addColumnIfMissing = (name: string, definition: string): void => {
            if (existingColumns.has(name)) {
                return;
            }
            this.execute(`ALTER TABLE player_scores ADD COLUMN ${name} ${definition};`);
            existingColumns.add(name);
        };

        addColumnIfMissing("display_name", "TEXT NOT NULL DEFAULT 'Unnamed Pilot'");
        addColumnIfMissing("provider", "TEXT NOT NULL DEFAULT 'local'");
        addColumnIfMissing("points", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("orbs", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("assists", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("deaths", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("kills", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("rank_title", "TEXT NOT NULL DEFAULT 'Private'");
        addColumnIfMissing("created_at", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("updated_at", "INTEGER NOT NULL DEFAULT 0");
    }

    private loadFromDatabase(): void {
        const rows = this.query(`
            SELECT
                user_id AS userId,
                display_name AS displayName,
                provider,
                points,
                orbs,
                assists,
                rank_title AS rankTitle,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM player_scores;
        `) as PersistedScoreRow[];

        for (const row of rows) {
            if (!row || typeof row.userId !== "string") {
                continue;
            }
            const id = sanitizeUserId(row.userId);
            const score = clampToNonNegativeInt(row.points);
            const profile: RuntimeUserProfile = {
                id,
                name: sanitizeDisplayName(row.displayName, id.slice(0, 12) || "Player"),
                score,
                rank: resolveRankTitle(score),
                orbs: clampToNonNegativeInt(row.orbs),
                assists: clampToNonNegativeInt(row.assists),
                updatedAt: clampToNonNegativeInt(row.updatedAt)
            };
            this.users.set(id, profile);
        }
    }

    private persistProfile(profile: RuntimeUserProfile): void {
        const now = Date.now();
        const safeId = sanitizeUserId(profile.id);
        const score = clampToNonNegativeInt(profile.score);
        const resolvedRank = resolveRankTitle(score);
        const updatedAt = clampToNonNegativeInt(profile.updatedAt || now);
        const createdAt = updatedAt;
        const provider = providerFromUserId(safeId);

        const sql = `
            INSERT INTO player_scores (
                user_id, display_name, provider, points, orbs, assists, deaths, kills, rank_title, created_at, updated_at
            ) VALUES (
                ${escapeValue(safeId)},
                ${escapeValue(sanitizeDisplayName(profile.name, safeId.slice(0, 12) || "Player"))},
                ${escapeValue(provider)},
                ${score},
                ${clampToNonNegativeInt(profile.orbs)},
                ${clampToNonNegativeInt(profile.assists)},
                0,
                0,
                ${escapeValue(resolvedRank)},
                COALESCE((SELECT created_at FROM player_scores WHERE user_id = ${escapeValue(safeId)}), ${createdAt}),
                ${updatedAt}
            ) ON CONFLICT(user_id) DO UPDATE SET
                display_name = excluded.display_name,
                provider = excluded.provider,
                points = excluded.points,
                orbs = excluded.orbs,
                assists = excluded.assists,
                rank_title = excluded.rank_title,
                updated_at = excluded.updated_at;
        `;
        this.execute(sql);
    }

    private execute(sql: string): void {
        if (!this.sqlEnabled || !sql.trim()) {
            return;
        }
        try {
            execFileSync(this.sqliteBin, [this.dbPath, sql], {
                encoding: "utf8",
                stdio: ["ignore", "ignore", "pipe"]
            });
        } catch {
            // Keep runtime functional using in-memory fallback even if SQL persistence fails.
        }
    }

    private query(sql: string): unknown[] {
        if (!this.sqlEnabled || !sql.trim()) {
            return [];
        }
        try {
            const output = execFileSync(this.sqliteBin, [this.dbPath, "-cmd", ".mode json", sql], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"]
            });
            const trimmed = output.trim();
            if (!trimmed) {
                return [];
            }
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
}

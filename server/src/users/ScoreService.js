"use strict";

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_DB_PATH = path.join(__dirname, '../../data/scores.db');
const SQLITE_BIN = process.env.SQLITE3_PATH || 'sqlite3';
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;

const RANK_THRESHOLDS = [
    { limit: 100, title: 'Private' },
    { limit: 200, title: 'Corporal' },
    { limit: 500, title: 'Sergeant' },
    { limit: 1000, title: 'Sergeant Major' },
    { limit: 2000, title: 'Lieutenant' },
    { limit: 4000, title: 'Captain' },
    { limit: 8000, title: 'Major' },
    { limit: 16000, title: 'Colonel' },
    { limit: 30000, title: 'Brigadier' },
    { limit: 45000, title: 'General' },
    { limit: 60000, title: 'Baron' },
    { limit: 80000, title: 'Earl' },
    { limit: 100000, title: 'Count' },
    { limit: 125000, title: 'Duke' },
    { limit: 150000, title: 'Archduke' },
    { limit: 200000, title: 'Grand Duke' },
    { limit: 250000, title: 'Lord' },
    { limit: 300000, title: 'Chancellor' },
    { limit: 350000, title: 'Royaume' },
    { limit: 400000, title: 'Emperor' },
    { limit: 500000, title: 'Auror' },
    { limit: Infinity, title: 'King' }
];

const clampToNonNegativeInt = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    const floored = Math.floor(numeric);
    return floored < 0 ? 0 : floored;
};

const escapeValue = (value) => {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(Math.floor(value));
    }
    const stringValue = String(value)
        .replace(CONTROL_CHAR_PATTERN, '')
        .replace(/'/g, "''");
    return `'${stringValue}'`;
};

class ScoreService {
    constructor(options = {}) {
        this.userStore = options.userStore || null;
        this.dbPath = options.dbPath || DEFAULT_DB_PATH;
        this.rankOrder = RANK_THRESHOLDS.reduce((acc, entry, index) => {
            acc[entry.title] = index;
            return acc;
        }, {});
        this._initialiseDatabase();
    }

    _initialiseDatabase() {
        try {
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
            this._execute(schema);
        } catch (error) {
            console.warn('[score] Failed to initialise score database:', error.message);
        }
    }

    _execute(sql) {
        if (!sql || !sql.trim()) {
            return;
        }
        try {
            execFileSync(SQLITE_BIN, [this.dbPath, sql], {
                encoding: 'utf8',
                stdio: ['ignore', 'ignore', 'pipe']
            });
        } catch (error) {
            const stderr = error && error.stderr ? error.stderr.toString() : error.message;
            console.warn('[score] SQLite command failed:', stderr);
        }
    }

    _query(sql) {
        if (!sql || !sql.trim()) {
            return [];
        }
        try {
            const output = execFileSync(SQLITE_BIN, [this.dbPath, '-cmd', '.mode json', sql], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            });
            const trimmed = output ? output.trim() : '';
            if (!trimmed) {
                return [];
            }
            return JSON.parse(trimmed);
        } catch (error) {
            const stderr = error && error.stderr ? error.stderr.toString() : error.message;
            console.warn('[score] SQLite query failed:', stderr);
            return [];
        }
    }

    _getIdentity(userId) {
        if (!this.userStore || typeof this.userStore.get !== 'function') {
            return null;
        }
        return this.userStore.get(String(userId));
    }

    _sanitizeName(name) {
        if (!name || typeof name !== 'string') {
            return 'Unnamed Pilot';
        }
        const cleaned = name
            .replace(CONTROL_CHAR_PATTERN, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 64);
        return cleaned.length ? cleaned : 'Unnamed Pilot';
    }

    _resolveDisplayName(identity, fallback) {
        if (identity && identity.name) {
            return this._sanitizeName(identity.name);
        }
        if (fallback) {
            return this._sanitizeName(fallback);
        }
        if (identity && identity.email) {
            return this._sanitizeName(identity.email.split('@')[0]);
        }
        return 'Unnamed Pilot';
    }

    resolveRank(points) {
        const numeric = clampToNonNegativeInt(points);
        for (let index = 0; index < RANK_THRESHOLDS.length; index += 1) {
            const entry = RANK_THRESHOLDS[index];
            if (numeric < entry.limit) {
                return entry.title;
            }
        }
        return RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1].title;
    }

    getProfile(userId) {
        if (!userId) {
            return null;
        }
        const rows = this._query(`
            SELECT
                user_id AS userId,
                display_name AS displayName,
                provider,
                points,
                orbs,
                assists,
                deaths,
                kills,
                rank_title AS rankTitle,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM player_scores
            WHERE user_id = ${escapeValue(userId)}
            LIMIT 1;
        `);
        if (!rows || !rows.length) {
            return null;
        }
        const row = rows[0];
        return {
            userId: row.userId,
            displayName: row.displayName,
            provider: row.provider,
            points: clampToNonNegativeInt(row.points),
            orbs: clampToNonNegativeInt(row.orbs),
            assists: clampToNonNegativeInt(row.assists),
            deaths: clampToNonNegativeInt(row.deaths),
            kills: clampToNonNegativeInt(row.kills),
            rankTitle: row.rankTitle || this.resolveRank(row.points),
            createdAt: clampToNonNegativeInt(row.createdAt),
            updatedAt: clampToNonNegativeInt(row.updatedAt)
        };
    }

    updateUser(userId, updater) {
        if (!userId) {
            return null;
        }
        const identity = this._getIdentity(userId);
        if (!identity || identity.provider !== 'google') {
            return null;
        }
        const now = Date.now();
        const existing = this.getProfile(userId);
        const isNew = !existing;
        const profile = existing ? Object.assign({}, existing) : {
            userId: String(userId),
            displayName: identity.name || identity.email || 'Unnamed Pilot',
            provider: identity.provider,
            points: 0,
            orbs: 0,
            assists: 0,
            deaths: 0,
            kills: 0,
            rankTitle: this.resolveRank(0),
            createdAt: now,
            updatedAt: now
        };

        const before = {
            points: clampToNonNegativeInt(profile.points),
            orbs: clampToNonNegativeInt(profile.orbs),
            assists: clampToNonNegativeInt(profile.assists),
            deaths: clampToNonNegativeInt(profile.deaths),
            kills: clampToNonNegativeInt(profile.kills),
            rankTitle: profile.rankTitle || this.resolveRank(profile.points),
            displayName: profile.displayName || '',
            provider: profile.provider || identity.provider
        };

        if (typeof updater === 'function') {
            updater(profile);
        }

        const sanitized = this._sanitizeProfile(profile, identity, now, existing);
        const changed = isNew
            || sanitized.points !== before.points
            || sanitized.orbs !== before.orbs
            || sanitized.assists !== before.assists
            || sanitized.deaths !== before.deaths
            || sanitized.kills !== before.kills
            || sanitized.rankTitle !== before.rankTitle
            || sanitized.displayName !== before.displayName
            || sanitized.provider !== before.provider;

        if (!changed) {
            return { profile: sanitized, promotion: null, changed: false };
        }

        const sql = `
            INSERT INTO player_scores (
                user_id, display_name, provider, points, orbs, assists, deaths, kills, rank_title, created_at, updated_at
            ) VALUES (
                ${escapeValue(sanitized.userId)},
                ${escapeValue(sanitized.displayName)},
                ${escapeValue(sanitized.provider)},
                ${sanitized.points},
                ${sanitized.orbs},
                ${sanitized.assists},
                ${sanitized.deaths},
                ${sanitized.kills},
                ${escapeValue(sanitized.rankTitle)},
                ${sanitized.createdAt},
                ${sanitized.updatedAt}
            ) ON CONFLICT(user_id) DO UPDATE SET
                display_name = excluded.display_name,
                provider = excluded.provider,
                points = excluded.points,
                orbs = excluded.orbs,
                assists = excluded.assists,
                deaths = excluded.deaths,
                kills = excluded.kills,
                rank_title = excluded.rank_title,
                updated_at = excluded.updated_at;
        `;

        this._execute(sql);
        const updated = this.getProfile(userId) || sanitized;
        const previousRankIndex = this.rankOrder[before.rankTitle] ?? 0;
        const newRankIndex = this.rankOrder[updated.rankTitle] ?? previousRankIndex;
        const promotion = (newRankIndex > previousRankIndex && updated.points > before.points)
            ? {
                    userId: updated.userId,
                    rankTitle: updated.rankTitle,
                    displayName: updated.displayName
                }
            : null;

        return { profile: updated, promotion, changed: true };
    }

    _sanitizeProfile(profile, identity, timestamp, existing) {
        const sanitized = Object.assign({}, profile);
        sanitized.userId = String(profile.userId);
        sanitized.displayName = this._resolveDisplayName(identity, profile.displayName);
        sanitized.provider = 'google';
        sanitized.points = clampToNonNegativeInt(profile.points);
        sanitized.orbs = clampToNonNegativeInt(profile.orbs);
        sanitized.assists = clampToNonNegativeInt(profile.assists);
        sanitized.deaths = clampToNonNegativeInt(profile.deaths);
        sanitized.kills = clampToNonNegativeInt(profile.kills);
        sanitized.rankTitle = this.resolveRank(sanitized.points);
        sanitized.createdAt = existing && Number.isFinite(existing.createdAt)
            ? existing.createdAt
            : clampToNonNegativeInt(profile.createdAt) || timestamp;
        sanitized.updatedAt = timestamp;
        return sanitized;
    }

    syncIdentity(identity) {
        if (!identity || !identity.id) {
            return null;
        }
        return this.updateUser(identity.id, () => {});
    }

    recordOrbVictory({ participantUserIds = [], orbHolderUserId = null, points = 0 }) {
        if (!Array.isArray(participantUserIds) || !participantUserIds.length) {
            return { changed: false, promotions: [] };
        }
        const uniqueIds = Array.from(new Set(participantUserIds.map((value) => String(value))));
        const pointDelta = clampToNonNegativeInt(points);
        let changed = false;
        const promotions = [];

        uniqueIds.forEach((userId) => {
            const update = this.updateUser(userId, (profile) => {
                profile.points = clampToNonNegativeInt(profile.points) + pointDelta;
                if (orbHolderUserId && String(orbHolderUserId) === userId) {
                    profile.orbs = clampToNonNegativeInt(profile.orbs) + 1;
                } else {
                    profile.assists = clampToNonNegativeInt(profile.assists) + 1;
                }
            });
            if (update && update.changed) {
                changed = true;
                if (update.promotion) {
                    promotions.push(update.promotion);
                }
            }
        });

        return { changed, promotions };
    }

    recordDeath({ victimUserId = null, killerUserIds = [], killerUserId = null }) {
        let changed = false;
        const promotions = [];
        let penaltyApplied = false;

        if (victimUserId) {
            const victimProfile = this.getProfile(victimUserId);
            const shouldPenalize = victimProfile && victimProfile.points > 100;
            const update = this.updateUser(victimUserId, (profile) => {
                profile.deaths = clampToNonNegativeInt(profile.deaths) + 1;
                if (shouldPenalize) {
                    const currentPoints = clampToNonNegativeInt(profile.points);
                    profile.points = currentPoints > 2 ? currentPoints - 2 : 0;
                }
            });
            if (update && update.changed) {
                changed = true;
            }
            penaltyApplied = shouldPenalize;
        }

        const killerId = killerUserId ? String(killerUserId) : null;
        const uniqueKillers = new Set();

        if (Array.isArray(killerUserIds)) {
            killerUserIds.forEach((value) => {
                uniqueKillers.add(String(value));
            });
        }
        if (killerId) {
            uniqueKillers.add(killerId);
        }

        uniqueKillers.forEach((userId) => {
            const isKiller = killerId !== null && killerId === userId;
            const shouldReward = isKiller || penaltyApplied;
            if (!shouldReward) {
                return;
            }

            const update = this.updateUser(userId, (profile) => {
                profile.points = clampToNonNegativeInt(profile.points) + 2;
                if (isKiller) {
                    profile.kills = clampToNonNegativeInt(profile.kills) + 1;
                }
            });
            if (update && update.changed) {
                changed = true;
                if (update.promotion) {
                    promotions.push(update.promotion);
                }
            }
        });

        return { changed, promotions };
    }

    getHighScores(limit = 20) {
        const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
        const rows = this._query(`
            SELECT
                user_id AS userId,
                display_name AS displayName,
                provider,
                points,
                orbs,
                assists,
                rank_title AS rankTitle,
                updated_at AS updatedAt
            FROM player_scores
            ORDER BY points DESC, orbs DESC, assists DESC, updated_at ASC
            LIMIT ${boundedLimit};
        `);
        if (!rows || !rows.length) {
            return [];
        }
        return rows.map((row) => {
            const identity = this._getIdentity(row.userId);
            const name = this._resolveDisplayName(identity, row.displayName);
            const points = clampToNonNegativeInt(row.points);
            return {
                userId: row.userId,
                name,
                points,
                rankTitle: row.rankTitle || this.resolveRank(points),
                orbs: clampToNonNegativeInt(row.orbs),
                assists: clampToNonNegativeInt(row.assists),
                updatedAt: clampToNonNegativeInt(row.updatedAt)
            };
        });
    }
}

module.exports = ScoreService;

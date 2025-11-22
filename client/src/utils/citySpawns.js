import citySpawns from '../../../shared/citySpawns.json' with { type: 'json' };

const TILE_SIZE = 48;
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;
const COMMAND_CENTER_FRONT_OFFSET = TILE_SIZE / 2;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;
const PLAYER_SPAWN_ADJUST_X = 6.5;
const PLAYER_SPAWN_ADJUST_Y = 5.5;

const normaliseCityId = (cityId) => {
    if (cityId === null || cityId === undefined) {
        return null;
    }
    const numeric = Number(cityId);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return String(Math.max(0, Math.floor(numeric)));
};
const resolveSpawnFromEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const pixelX = Number(entry.pixelX);
    const pixelY = Number(entry.pixelY);
    const tileX = Number(entry.tileX);
    const tileY = Number(entry.tileY);

    const hasPixelX = Number.isFinite(pixelX);
    const hasPixelY = Number.isFinite(pixelY);
    const hasTileX = Number.isFinite(tileX);
    const hasTileY = Number.isFinite(tileY);

    if (hasPixelX && hasPixelY) {
        return {
            x: pixelX,
            y: pixelY,
            tileX: hasTileX ? tileX : null,
            tileY: hasTileY ? tileY : null
        };
    }

    if (hasTileX && hasTileY) {
        const baseX = tileX * TILE_SIZE;
        const baseY = tileY * TILE_SIZE;
        const centerX = baseX + (COMMAND_CENTER_WIDTH_TILES * TILE_SIZE) / 2;
        const centerY = baseY + (COMMAND_CENTER_HEIGHT_TILES * TILE_SIZE) + COMMAND_CENTER_FRONT_OFFSET;
        return {
            x: centerX - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_X,
            y: centerY - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_Y,
            tileX,
            tileY
        };
    }

    return {
        x: 0,
        y: 0,
        tileX: hasTileX ? tileX : null,
        tileY: hasTileY ? tileY : null
    };
};

export const getCitySpawn = (cityId) => {
    const key = normaliseCityId(cityId);
    if (key === null) {
        return null;
    }
    const entry = citySpawns?.[key];
    const resolved = resolveSpawnFromEntry(entry);
    if (!resolved) {
        return null;
    }
    const name = entry?.name || `City ${Number(key) + 1}`;
    return {
        ...resolved,
        name
    };
};

export const getCityDisplayName = (cityId) => {
    const key = normaliseCityId(cityId);
    if (key !== null) {
        const entry = citySpawns?.[key];
        if (entry?.name) {
            return entry.name;
        }
    }
    const numeric = Number(cityId);
    if (Number.isFinite(numeric)) {
        return `City ${Math.max(1, Math.floor(numeric) + 1)}`;
    }
    return 'City';
};

export const findCityIdByTile = (tileX, tileY, tolerance = 3) => {
    const x = Number(tileX);
    const y = Number(tileY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    let candidate = null;
    let bestDelta = Infinity;

    Object.keys(citySpawns || {}).forEach((key) => {
        const entry = citySpawns[key];
        if (!entry) {
            return;
        }
        const entryX = Number(entry.tileX);
        const entryY = Number(entry.tileY);
        if (!Number.isFinite(entryX) || !Number.isFinite(entryY)) {
            return;
        }
        const deltaX = Math.abs(entryX - x);
        const deltaY = Math.abs(entryY - y);
        const maxDelta = Math.max(deltaX, deltaY);
        if (maxDelta > tolerance) {
            return;
        }
        if (maxDelta < bestDelta) {
            bestDelta = maxDelta;
            candidate = key;
        } else if (maxDelta === bestDelta) {
            const current = Number(candidate);
            const next = Number(key);
            if (Number.isFinite(next) && (!Number.isFinite(current) || next < current)) {
                candidate = key;
            }
        }
    });

    if (candidate === null || candidate === undefined) {
        return null;
    }
    const id = Number(candidate);
    return Number.isFinite(id) ? id : null;
};

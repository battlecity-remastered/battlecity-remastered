import { getCityDisplayName } from '../utils/citySpawns.js';

const toFiniteCityId = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return Math.max(0, Math.floor(numeric));
};

const getEntityCallsign = (game, entity) => {
    if (!entity) {
        return null;
    }
    if (typeof entity.callsign === 'string' && entity.callsign.trim().length) {
        return entity.callsign.trim();
    }
    if (entity.id && typeof game?.resolveCallsign === 'function') {
        const resolved = game.resolveCallsign(entity.id);
        if (typeof resolved === 'string' && resolved.trim().length) {
            return resolved.trim();
        }
    }
    return null;
};

const RANK_THRESHOLDS = Object.freeze([
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
]);

const VALID_RANK_TITLES = new Set(RANK_THRESHOLDS.map((entry) => entry.title));

const resolveRankTitle = (entity) => {
    if (entity && typeof entity.rankTitle === 'string' && entity.rankTitle.trim().length) {
        const trimmed = entity.rankTitle.trim();
        if (VALID_RANK_TITLES.has(trimmed)) {
            return trimmed;
        }
    }
    if (entity && typeof entity.rank === 'string' && entity.rank.trim().length) {
        const trimmed = entity.rank.trim();
        if (VALID_RANK_TITLES.has(trimmed)) {
            return trimmed;
        }
    }
    const points = Number(entity?.points);
    if (Number.isFinite(points) && points >= 0) {
        for (let i = 0; i < RANK_THRESHOLDS.length; i += 1) {
            if (points < RANK_THRESHOLDS[i].limit) {
                return RANK_THRESHOLDS[i].title;
            }
        }
    }
    return 'Private';
};

export const buildRoleLabel = (game, entity, options = {}) => {
    const callsign = getEntityCallsign(game, entity);
    const cityId = toFiniteCityId(entity?.city);
    const cityName = Number.isFinite(cityId) ? getCityDisplayName(cityId) : null;
    const isRogue = options.isRogue === true || (entity?.city === -1);
    const rankTitle = isRogue ? 'Rogue' : resolveRankTitle(entity);
    const namePart = callsign || 'Unit';
    const roleLine = `${rankTitle} ${namePart}`;
    if (isRogue || !cityName) {
        return roleLine;
    }
    return `${roleLine}\n${cityName}`;
};

export { toFiniteCityId };

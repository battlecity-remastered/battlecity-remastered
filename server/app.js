/*jslint node: true */
"use strict";

var express = require('express');
var http = require('http');
var https = require('https');
var path = require('path');
var fs = require('fs');
var { Server } = require('socket.io');
var app = express();
var server = http.createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', 1);

var isRender = process.env.RENDER === 'true';
var isProduction = process.env.NODE_ENV === 'production' || isRender;

var CLIENT_DIST_DIR = path.join(__dirname, '..', 'client', 'dist');
var CLIENT_INDEX_FILE = path.join(CLIENT_DIST_DIR, 'index.html');
var hasBuiltClient = fs.existsSync(CLIENT_INDEX_FILE);

var citySpawns = require('../shared/citySpawns.json');
var UserStore = require('./src/users/UserStore');
var ScoreService = require('./src/users/ScoreService');
var DiscordNotifier = require('./src/integrations/DiscordNotifier');

const parseClientIds = (value) => {
    if (!value || typeof value !== 'string') {
        return [];
    }
    return value
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
};

const GOOGLE_AUDIENCES = parseClientIds(process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '');

const parseOrigins = (value) => {
    if (!value || typeof value !== 'string') {
        return [];
    }
    return value
        .split(/[;,\s]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
};

const DEFAULT_CLIENT_ORIGINS = [
    'http://localhost:8020',
    'http://127.0.0.1:8020',
    'http://0.0.0.0:8020'
];

const CLIENT_ORIGINS = (() => {
    const configured = parseOrigins(process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || '');
    if (configured.length > 0) {
        return configured;
    }
    return DEFAULT_CLIENT_ORIGINS;
})();

const normaliseOrigin = (value) => {
    if (!value || typeof value !== 'string') {
        return '';
    }
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}`;
    } catch (_error) {
        return value.replace(/\/$/, '');
    }
};

const isWildcardOriginAllowed = () => CLIENT_ORIGINS.includes('*');

const isOriginAllowed = (origin) => {
    if (isWildcardOriginAllowed()) {
        return true;
    }
    const candidate = normaliseOrigin(origin);
    return CLIENT_ORIGINS.some((allowed) => normaliseOrigin(allowed) === candidate);
};

const resolveResponseOrigin = (originHeader) => {
    if (originHeader && isOriginAllowed(originHeader)) {
        return originHeader;
    }
    return CLIENT_ORIGINS[0] || 'http://localhost:8020';
};

var socketOptions = {};
if (!isProduction) {
    socketOptions.cors = {
        origin(origin, callback) {
            if (!origin || isOriginAllowed(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Not allowed by CORS'));
        },
        methods: ["GET", "POST"]
    };
}

var io = new Server(server, socketOptions);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
});

if (!isProduction) {
    app.use((req, res, next) => {
        const requestOrigin = req.headers.origin;
        const responseOrigin = resolveResponseOrigin(requestOrigin);
        res.header('Access-Control-Allow-Origin', responseOrigin);
        res.append('Vary', 'Origin');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
        if (req.method === 'OPTIONS') {
            res.sendStatus(204);
            return;
        }
        next();
    });
}

var staticOptions = {
    index: false,
    etag: true,
    redirect: false,
    maxAge: isProduction ? '1h' : 0,
    setHeaders(res, filePath) {
        if (path.extname(filePath) === '.html') {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (isProduction) {
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
        res.append('Vary', 'Accept-Encoding');
    }
};

if (hasBuiltClient) {
    app.use(express.static(CLIENT_DIST_DIR, staticOptions));
}

var PlayerFactory = require('./src/PlayerFactory');
var BulletFactory = require('./src/BulletFactory');
var BuildingFactory = require('./src/BuildingFactory');
var HazardManager = require('./src/hazards/HazardManager');
var OrbManager = require('./src/orb/OrbManager');
var FakeCityManager = require('./src/FakeCityManager');
var DefenseManager = require('./src/DefenseManager');
var IconDropManager = require('./src/IconDropManager');
var { loadMapData } = require('./src/utils/mapLoader');
var ChatManager = require('./src/chat/ChatManager');
var { LoopMonitor } = require('./src/utils/LoopMonitor');

const parseBooleanEnv = (value) => {
    if (value === undefined || value === null) {
        return false;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return normalized === '1' ||
        normalized === 'true' ||
        normalized === 'yes' ||
        normalized === 'y' ||
        normalized === 'on';
};

const shouldProfileLoop = parseBooleanEnv(process.env.SERVER_LOOP_PROFILER || process.env.SERVER_PROFILE_LOOP);
const explicitFakeCityFlag = process.env.SERVER_DISABLE_FAKE_CITIES ?? process.env.DISABLE_FAKE_CITIES;
const disableFakeCities = explicitFakeCityFlag !== undefined
    ? parseBooleanEnv(explicitFakeCityFlag)
    : shouldProfileLoop;
const loopMonitor = shouldProfileLoop ? new LoopMonitor({
    reportIntervalMs: Number(process.env.SERVER_LOOP_REPORT_MS) || 5000,
    maxSamples: Number(process.env.SERVER_LOOP_SAMPLE_SIZE) || 600,
    label: 'server-loop'
}) : null;

app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ status: 'ok', uptime: process.uptime() });
});

var PORT = process.env.PORT || 8021;
server.listen(PORT, () => {
    console.log(`BattleCity server listening on port ${PORT}`);
});

var game = {
    tick: 0,

    players: {},
    cities: [],
    map: []
};

try {
    var mapData = loadMapData();
    if (mapData && Array.isArray(mapData.map)) {
        game.map = mapData.map;
        console.log(`[map] Loaded map.dat (${game.map.length} columns / ${Array.isArray(game.map[0]) ? game.map[0].length : 0} rows)`);
    } else {
        console.warn('[map] Map data missing or invalid, collision checks may fail');
    }
} catch (_error) {
    console.warn('[map] Unable to load map data:', _error.message);
}


const userStore = new UserStore();
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_TOKEN_TIMEOUT_MS = 5000;

const fetchJson = (url, { timeout = GOOGLE_TOKEN_TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
    try {
        const request = https.get(url, (response) => {
            const status = response.statusCode || 0;
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                if (status < 200 || status >= 300) {
                    const error = new Error(`Request failed with status ${status}`);
                    error.status = status;
                    return reject(error);
                }
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (parseError) {
                    reject(parseError);
                }
            });
        });
        request.on('error', reject);
        request.setTimeout(timeout, () => {
            request.destroy(new Error('Request timed out'));
        });
    } catch (_error) {
        reject(_error);
    }
});

const verifyGoogleToken = async (credential) => {
    if (!credential || typeof credential !== 'string') {
        const error = new Error('Missing credential');
        error.code = 'MISSING_CREDENTIAL';
        throw error;
    }
    const url = `${GOOGLE_TOKEN_ENDPOINT}?id_token=${encodeURIComponent(credential)}`;
    const payload = await fetchJson(url);
    if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string') {
        const error = new Error('Invalid token response');
        error.code = 'INVALID_RESPONSE';
        throw error;
    }
    if (Array.isArray(GOOGLE_AUDIENCES) && GOOGLE_AUDIENCES.length > 0) {
        const audience = payload.aud || payload.azp || '';
        if (!audience || !GOOGLE_AUDIENCES.includes(String(audience))) {
            const error = new Error('Token audience mismatch');
            error.code = 'AUDIENCE_MISMATCH';
            throw error;
        }
    }
    return payload;
};

const scoreService = new ScoreService({ userStore });
const discordNotifier = new DiscordNotifier();
discordNotifier.start().catch((error) => {
    console.warn('[discord] failed to initialise notifier:', error && error.message ? error.message : error);
});
const playerFactory = new PlayerFactory(game, { userStore, scoreService, notifier: discordNotifier });
playerFactory.listen(io);
const bulletFactory = new BulletFactory(game, playerFactory);
bulletFactory.listen(io);
const buildingFactory = new BuildingFactory(game);
buildingFactory.listen(io);
game.buildingFactory = buildingFactory;
const hazardManager = new HazardManager(game, playerFactory);
hazardManager.setIo(io);
const defenseManager = new DefenseManager({ game, playerFactory });
defenseManager.setIo(io);
const iconDropManager = new IconDropManager({
    cityManager: buildingFactory.cityManager,
    playerFactory
});
iconDropManager.setIo(io);
buildingFactory.setManagers({ hazardManager, defenseManager, playerFactory });
const orbManager = new OrbManager({
    game,
    cityManager: buildingFactory.cityManager,
    playerFactory,
    buildingFactory,
    hazardManager,
    defenseManager,
    iconDropManager,
    notifier: discordNotifier,
});
orbManager.setIo(io);
orbManager.setNotifier(discordNotifier);
const fakeCityManager = new FakeCityManager({
    game,
    buildingFactory,
    playerFactory,
    hazardManager,
    defenseManager,
    bulletFactory,
    enabled: !disableFakeCities,
});
fakeCityManager.setIo(io);

const chatManager = new ChatManager({
    game,
    playerFactory,
});
chatManager.listen(io);
playerFactory.setChatManager(chatManager);
if (typeof playerFactory.setScoreService === 'function') {
    playerFactory.setScoreService(scoreService);
}
if (typeof playerFactory.setNotifier === 'function') {
    playerFactory.setNotifier(discordNotifier);
}

app.post('/api/users/register', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    try {
        const user = userStore.register(name);
        if (!user) {
            res.status(400).json({ error: 'invalid_name' });
            return;
        }
        res.status(201).json(user);
    } catch (_error) {
        if (_error?.code === 'NAME_TAKEN') {
            res.status(409).json({ error: 'name_taken' });
            return;
        }
        console.warn('[users] register failed:', _error?.message || _error);
        res.status(500).json({ error: 'save_failed' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    const credential = typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';
    if (!credential) {
        res.status(400).json({ error: 'missing_credential' });
        return;
    }
    try {
        const payload = await verifyGoogleToken(credential);
        const profile = userStore.registerWithProvider({
            provider: 'google',
            providerId: payload.sub,
            name: payload.name || payload.given_name || payload.family_name || null,
            email: payload.email,
            given_name: payload.given_name,
            family_name: payload.family_name
        });
        if (!profile) {
            res.status(400).json({ error: 'registration_failed' });
            return;
        }
        res.json(profile);
    } catch (_error) {
        if (_error && _error.message) {
            console.warn('[auth] Google verification failed:', _error.message);
        }
        if (_error.code === 'AUDIENCE_MISMATCH') {
            res.status(403).json({ error: 'audience_mismatch' });
            return;
        }
        if (_error.code === 'NAME_TAKEN') {
            res.status(409).json({ error: 'name_taken' });
            return;
        }
        if (_error.status && _error.status >= 500) {
            res.status(503).json({ error: 'upstream_unavailable' });
            return;
        }
        res.status(401).json({ error: 'invalid_credential' });
    }
});

app.get('/api/identity/config', (_req, res) => {
    const clientIds = Array.isArray(GOOGLE_AUDIENCES) ? GOOGLE_AUDIENCES.filter((value) => value && value.length) : [];
    res.json({
        google: {
            enabled: clientIds.length > 0,
            clientIds,
            clientId: clientIds.length > 0 ? clientIds[0] : null,
        },
    });
});

app.get('/api/scores/high', (req, res) => {
    const limitRaw = req.query && req.query.limit ? Number(req.query.limit) : null;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;
    const players = scoreService && typeof scoreService.getHighScores === 'function'
        ? scoreService.getHighScores(limit)
        : [];
    res.json({ players });
});

app.put('/api/users/:id', (req, res) => {
    const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
        res.status(400).json({ error: 'invalid_id' });
        return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const sanitized = userStore.sanitize(name);
    if (!sanitized) {
        res.status(400).json({ error: 'invalid_name' });
        return;
    }
    const existing = userStore.get(id);
    if (!existing) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    try {
        const updated = userStore.update(id, sanitized);
        res.json(updated);
    } catch (_error) {
        if (_error?.code === 'NAME_TAKEN') {
            res.status(409).json({ error: 'name_taken' });
            return;
        }
        console.warn('[users] update failed:', _error?.message || _error);
        res.status(500).json({ error: 'save_failed' });
    }
});

app.get('/api/users/:id', (req, res) => {
    const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
        res.status(400).json({ error: 'invalid_id' });
        return;
    }
    const user = userStore.get(id);
    if (!user) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    res.json(user);
});

if (hasBuiltClient) {
    app.get('*', (req, res, next) => {
        if (req.method !== 'GET') {
            next();
            return;
        }
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io/')) {
            next();
            return;
        }
        res.sendFile(CLIENT_INDEX_FILE, (error) => {
            if (error) {
                next(error);
            }
        });
    });
}

const shutdown = () => {
    const botProcesses = fakeCityManager.getBotProcesses();
    for (const processes of botProcesses.values()) {
        if (!processes) {
            continue;
        }
        const children = processes instanceof Set
            ? Array.from(processes)
            : (Array.isArray(processes) ? processes : [processes]);
        for (const child of children) {
            try {
                if (child && !child.killed) {
                    child.kill();
                }
            } catch (_error) {
                console.error(`[bot] error killing bot during shutdown: ${_error.message}`);
            }
        }
    }
    process.exit(0);
};

process.on('SIGUSR2', shutdown); // nodemon restart
process.on('SIGINT', shutdown); // Ctrl+C
process.on('SIGTERM', shutdown); // kill

const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (cityId) => {
    const numeric = toFiniteNumber(cityId, null);
    if (numeric === null) {
        return null;
    }
    return Math.max(0, Math.floor(numeric));
};

const getCityDisplayName = (cityId) => {
    const id = normaliseCityId(cityId);
    if (id === null) {
        return 'City';
    }
    const key = String(id);
    const entry = citySpawns && citySpawns[key];
    if (entry && entry.name) {
        return entry.name;
    }
    return `City ${id + 1}`;
};

const shortenId = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

const parseCityInspectPayload = (payload) => {
    if (payload === null || payload === undefined) {
        return null;
    }
    if (typeof payload === 'number') {
        return normaliseCityId(payload);
    }
    if (typeof payload === 'string') {
        try {
            const parsed = JSON.parse(payload);
            return parseCityInspectPayload(parsed);
        } catch (_error) {
            return normaliseCityId(payload);
        }
    }
    if (typeof payload === 'object') {
        if (payload.city !== undefined) {
            return normaliseCityId(payload.city);
        }
        if (payload.cityId !== undefined) {
            return normaliseCityId(payload.cityId);
        }
        if (payload.id !== undefined) {
            return normaliseCityId(payload.id);
        }
    }
    return null;
};

const collectCityInfo = (cityId) => {
    const id = normaliseCityId(cityId) ?? 0;
    const roster = playerFactory.ensureCityRoster
        ? playerFactory.ensureCityRoster(id)
        : null;

    const players = Object.values(game.players)
        .filter((player) => normaliseCityId(player && player.city) === id);

    const mayorId = roster && roster.mayor
        ? roster.mayor
        : (players.find((player) => player && player.isMayor)?.id || null);

    const mayorLabel = mayorId ? shortenId(mayorId) : null;

    let buildingCount = 0;
    if (buildingFactory && buildingFactory.buildings) {
        for (const building of buildingFactory.buildings.values()) {
            if (normaliseCityId(building && building.cityId) === id) {
                buildingCount += 1;
            }
        }
    }

    const cityManager = buildingFactory && buildingFactory.cityManager
        ? buildingFactory.cityManager
        : null;
    const cityState = cityManager
        ? cityManager.getCity(id)
        : (game.cities && game.cities[id]) || null;
    const cityName = (cityState && (cityState.nameOverride || cityState.name))
        ? (cityState.nameOverride || cityState.name)
        : getCityDisplayName(id);

    const orbPoints = cityState && cityManager
        ? cityManager.getOrbValue(cityState)
        : 0;
    const cityOrbs = cityState ? Number(cityState.orbs) || 0 : 0;
    const cityScore = cityState ? Number(cityState.score) || 0 : 0;
    const isOrbable = cityManager ? cityManager.isOrbable(id) : false;

    const startedAt = cityState && cityState.startedAt
        ? cityState.startedAt
        : (cityState && cityState.updatedAt) || null;
    const uptimeInMinutes = startedAt
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 60000))
        : 0;

    return {
        cityId: id,
        cityName,
        mayorId: mayorId || null,
        mayorLabel: mayorLabel,
        playerCount: players.length,
        buildingCount,
        isOrbable,
        orbs: cityOrbs,
        orbPoints,
        score: cityScore,
        uptimeInMinutes,
    };
};

io.on('connection', (socket) => {
    socket.on('hazard:spawn', (payload) => {
        hazardManager.spawnHazard(socket, payload);
    });
    socket.on('hazard:arm', (payload) => {
        hazardManager.handleArm(socket, hazardManager.parsePayload(payload));
    });
    socket.on('hazard:remove', (payload) => {
        hazardManager.handleRemove(socket, hazardManager.parsePayload(payload));
    });
    socket.on('city:inspect', (payload) => {
        const cityId = parseCityInspectPayload(payload);
        if (cityId === null || cityId === undefined) {
            return;
        }
        const info = collectCityInfo(cityId);
        if (info) {
            socket.emit('city:info', info);
        }
    });
    socket.on('orb:drop', (payload) => {
        orbManager.handleDrop(socket, payload);
    });
    socket.on('icon:drop', (payload) => {
        iconDropManager.handleDrop(socket, payload);
    });
    socket.on('icon:pickup', (payload) => {
        iconDropManager.handlePickup(socket, payload);
    });
    socket.on('defense:spawn', (payload) => {
        defenseManager.handleSpawn(socket, payload);
    });
    socket.on('defense:remove', (payload) => {
        defenseManager.handleRemove(socket, payload);
    });
    socket.on('disconnect', () => {
        hazardManager.onDisconnect(socket.id);
    });
    socket.on('bot:debug', (data) => {
        socket.broadcast.emit('bot:debug', data);
    });
    hazardManager.sendSnapshot(socket);
    fakeCityManager.sendSnapshot(socket);
});

const BUILDING_UPDATE_INTERVAL = 100;
let buildingAccumulator = 0;

var loop = () => {

    const loopStart = process.hrtime.bigint();
    var now = Date.now();
    if (!game.tick) {
        game.tick = now;
        game.lastTick = now;
    }
    var delta = now - (game.tick || now);
    if (delta < 0 || delta > 1000) {
        delta = 16;
    }
    game.lastTick = game.tick;
    game.tick = now;
    game.timePassed = delta;

    bulletFactory.cycle(delta);
    hazardManager.update(delta);
    playerFactory.cycle(now);
    fakeCityManager.update(now);

    buildingAccumulator += delta;
    if (buildingAccumulator >= BUILDING_UPDATE_INTERVAL) {
        buildingFactory.cycle();
        buildingAccumulator = buildingAccumulator % BUILDING_UPDATE_INTERVAL;
    }

    if (loopMonitor) {
        const loopEnd = process.hrtime.bigint();
        const durationNs = loopEnd - loopStart;
        loopMonitor.record({
            deltaMs: delta,
            durationNs: Number(durationNs)
        });
    }

    setTimeout(function () {
        loop();
    }, 16);
};
loop();

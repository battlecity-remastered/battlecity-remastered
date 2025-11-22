import PIXI from '../pixi';
import { getCityDisplayName } from '../utils/citySpawns';
import { scheduleDestroy } from '../utils/pixiPerformance';
import { MAX_HEALTH } from '../constants';
import { buildRoleLabel, toFiniteCityId } from './nameLabels';

const EXPLOSION_VARIANTS = {
    small: {
        frameSize: 48,
        totalFrames: 10,
        duration: 100,
        textureKey: 'imageSExplosion',
        fallbackKey: 'imageLEExplosion'
    },
    large: {
        frameSize: 144,
        totalFrames: 8,
        duration: 90,
        textureKey: 'imageLEExplosion',
        fallbackKey: 'imageSExplosion'
    },
    muzzle: {
        frameSize: 12,
        totalFrames: 2,
        duration: 45,
        textureKey: 'imageMuzzleFlash',
        fallbackKey: 'imageSExplosion'
    }
};
const EXPLOSION_FRAME_DURATION = 100;
const NAME_LABEL_OFFSET_Y = -6;
const NAME_LABEL_COLORS = Object.freeze({
    ally: 0xF2F6FF,
    enemy: 0xFFD166,
    rogue: 0xFF7A7A,
    neutral: 0xFFFFFF
});
const MIN_ENEMY_NAME_ALPHA = 0.35;
const CLOAK_NAME_ALPHA_MULTIPLIER = 0.35;
const MIN_CLOAK_NAME_ALPHA = 0.12;
const LABEL_CACHE_TTL_MS = 15000;

const determineLabelColor = (entity, referenceCity, options = {}) => {
    if (options.isRogue) {
        return NAME_LABEL_COLORS.rogue;
    }
    const entityCity = toFiniteCityId(entity?.city);
    const refCity = toFiniteCityId(referenceCity);
    if (entityCity !== null && refCity !== null && entityCity === refCity) {
        return NAME_LABEL_COLORS.ally;
    }
    if (entityCity === null) {
        return NAME_LABEL_COLORS.neutral;
    }
    return NAME_LABEL_COLORS.enemy;
};

const isEnemyEntity = (entity, referenceCity, options = {}) => {
    if (options.isRogue) {
        return true;
    }
    const entityCity = toFiniteCityId(entity?.city);
    const refCity = toFiniteCityId(referenceCity);
    if (entityCity === null || refCity === null) {
        return false;
    }
    return entityCity !== refCity;
};

const resolveHealthEmphasis = (entity, referenceCity, options = {}) => {
    if (!entity || !isEnemyEntity(entity, referenceCity, options)) {
        return 1;
    }
    const maxHealth = Number.isFinite(options.maxHealthOverride) ? options.maxHealthOverride : MAX_HEALTH;
    const entityHealth = Number.isFinite(entity.health) ? Math.max(0, entity.health) : null;
    if (!Number.isFinite(maxHealth) || maxHealth <= 0 || entityHealth === null) {
        return 1;
    }
    const normalized = Math.max(0, Math.min(1, entityHealth / maxHealth));
    return MIN_ENEMY_NAME_ALPHA + normalized * (1 - MIN_ENEMY_NAME_ALPHA);
};

const ensureNameLabelCache = (game) => {
    if (!game) {
        return null;
    }
    if (!game.__nameLabelCache) {
        game.__nameLabelCache = new Map();
    }
    return game.__nameLabelCache;
};

const resolveLabelCacheKey = (entity, options = {}) => {
    if (options.cacheKey) {
        return options.cacheKey;
    }
    if (entity && entity.id !== undefined && entity.id !== null) {
        return `entity:${entity.id}`;
    }
    if (entity && entity.callsign) {
        return `callsign:${entity.callsign}`;
    }
    return null;
};

const createNameLabel = (game, entity, options = {}) => {
    const cache = ensureNameLabelCache(game);
    if (!cache || !entity) {
        return null;
    }
    const cacheKey = resolveLabelCacheKey(entity, options);
    if (!cacheKey) {
        return null;
    }
    const text = buildRoleLabel(game, entity, options);
    if (!text || !text.trim()) {
        return null;
    }
    const fillColor = determineLabelColor(entity, options.referenceCity, options);
    let alpha = resolveHealthEmphasis(entity, options.referenceCity, options);
    if (entity?.isCloaked) {
        alpha = Math.max(MIN_CLOAK_NAME_ALPHA, alpha * CLOAK_NAME_ALPHA_MULTIPLIER);
    }
    let record = cache.get(cacheKey);
    if (!record) {
        const label = new PIXI.Text(text, {
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 'bold',
            fill: fillColor,
            align: 'center',
            stroke: 0x000000,
            strokeThickness: 3
        });
        label.anchor.set(0.5, 1);
        label.alpha = alpha;
        record = {
            label,
            text,
            fillColor,
            alpha,
        };
        cache.set(cacheKey, record);
    } else {
        if (record.text !== text) {
            record.label.text = text;
            record.text = text;
        }
        if (record.fillColor !== fillColor) {
            record.label.style.fill = fillColor;
            record.fillColor = fillColor;
            record.label.dirty = true;
        }
        if (record.alpha !== alpha) {
            record.label.alpha = alpha;
            record.alpha = alpha;
        }
    }
    record.lastUsedTick = game.tick || Date.now();
    return record.label;
};

const maybeAddNameLabel = (game, entity, sprite, options = {}) => {
    if (!sprite || !entity) {
        return;
    }
    const label = createNameLabel(game, entity, options);
    if (!label) {
        return;
    }
    if (label.parent !== sprite) {
        sprite.addChild(label);
    }
    label.x = sprite.width / 2;
    label.y = (-sprite.height / 2) - NAME_LABEL_OFFSET_Y;
};

const getTankRow = (player, me) => {
    if (!player) {
        return 0;
    }

    const isMayor = !!player.isMayor;
    const hasCustomTank = typeof player.tank === 'number';

    if (hasCustomTank) {
        return player.tank;
    }

    if (me && player.id === me.id) {
        return isMayor ? 1 : 0;
    }

    const sameCity = me && player.city !== undefined ? player.city === me.city : true;

    if (sameCity) {
        return isMayor ? 1 : 0;
    }

    return isMayor ? 3 : 2;
};

const tankTextureCache = new Map();

const getTankTexture = (game, row, column) => {
    const baseTexture = game.textures['tankTexture']?.baseTexture;
    if (!baseTexture) {
        return null;
    }
    const baseId = baseTexture.uid || baseTexture.cacheId || 'tank';
    const key = `${baseId}:${row}:${column}`;
    let texture = tankTextureCache.get(key);
    if (!texture) {
        texture = new PIXI.Texture(
            baseTexture,
            new PIXI.Rectangle(column * 48, row * 48, 48, 48)
        );
        tankTextureCache.set(key, texture);
    }
    return texture;
};

const createTankSprite = (game, player, me) => {
    const direction = player?.direction || 0;
    const row = getTankRow(player, me);
    const column = Math.floor(direction / 2);
    const texture = getTankTexture(game, row, column);
    if (!texture) {
        return new PIXI.Sprite();
    }
    return new PIXI.Sprite(texture);
};

var drawPlayer = (game, stage) => {

    var playerTank = createTankSprite(game, game.player, game.player);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;

    maybeAddNameLabel(game, game.player, playerTank, {
        referenceCity: game.player.city,
        cacheKey: 'player:self'
    });

    stage.addChild(playerTank);
};

var drawOtherPlayers = (game, stage) => {


    Object.keys(game.otherPlayers).forEach((id) => {

        var player = game.otherPlayers[id];

        if (!player) {
            return;
        }

        if (player.isCloaked) {
            const myId = game.player?.id;
            const sameCity = (player.city ?? null) === (game.player?.city ?? null);
            if (id !== myId && !sameCity) {
                return;
            }
        }

        var playerTank = createTankSprite(game, player, game.player);


        playerTank.x = ((player.offset.x) + (game.player.defaultOffset.x - (game.player.offset.x / 48) * 48));
        playerTank.y = ((player.offset.y) + (game.player.defaultOffset.y - (game.player.offset.y / 48) * 48));


        maybeAddNameLabel(game, player, playerTank, {
            referenceCity: game.player.city,
            isRogue: player.city === -1,
            cacheKey: player.id || id
        });


        stage.addChild(playerTank);
    });
};

const drawRogueTanks = (game, stage) => {
    const manager = game.rogueTankManager;
    if (!manager || !Array.isArray(manager.tanks) || manager.tanks.length === 0) {
        return;
    }

    manager.tanks.forEach((tank, index) => {
        if (!tank || !tank.offset) {
            return;
        }

        const sprite = createTankSprite(game, tank, game.player);
        sprite.x = (tank.offset.x) + (game.player.defaultOffset.x - (game.player.offset.x / 48) * 48);
        sprite.y = (tank.offset.y) + (game.player.defaultOffset.y - (game.player.offset.y / 48) * 48);
        maybeAddNameLabel(game, tank, sprite, {
            isRogue: true,
            referenceCity: game.player.city,
            cacheKey: tank.id || `rogue:${index}`
        });
        stage.addChild(sprite);
    });
};

var drawBullets = (game, stage) => {
    var bullet = game.bulletFactory.getHead();


    while (bullet) {

        var bulletTexture = game.textures['bulletTexture'];
        if (!bulletTexture) {
            return;
        }
        var tmpText = bulletTexture.clone();
        var spriteRow = bullet && Number.isFinite(bullet.type) ? bullet.type : 0;
        if (spriteRow < 0) {
            spriteRow = 0;
        }
        var spriteRows = 1;
        if (bulletTexture.baseTexture && Number.isFinite(bulletTexture.baseTexture.height)) {
            spriteRows = Math.max(1, Math.floor(bulletTexture.baseTexture.height / 8));
        }
        if (spriteRow >= spriteRows) {
            spriteRow = spriteRows - 1;
        }
        var bulletRect = new PIXI.Rectangle(bullet.animation * 8, spriteRow * 8, 8, 8);
        tmpText.frame = bulletRect;

        var sprite = new PIXI.Sprite(tmpText);
        sprite.x = ((bullet.x) + (game.player.defaultOffset.x - (game.player.offset.x)));
        sprite.y = ((bullet.y) + (game.player.defaultOffset.y - game.player.offset.y));


        bullet.animation++;
        if (bullet.animation > 3) {
            bullet.animation = 0;
        }

        stage.addChild(sprite);

        bullet = bullet.next;
    }
};

const drawExplosions = (game, stage) => {
    if (!Array.isArray(game.explosions) || game.explosions.length === 0) {
        return;
    }
    const now = game.tick || Date.now();
    for (let i = game.explosions.length - 1; i >= 0; i--) {
        const explosion = game.explosions[i];
        if (!explosion) {
            game.explosions.splice(i, 1);
            continue;
        }
        const variantKey = explosion.variant || 'large';
        const variant = EXPLOSION_VARIANTS[variantKey] || EXPLOSION_VARIANTS.large;
        const texture = game.textures[variant.textureKey] || game.textures[variant.fallbackKey];
        if (!texture || !texture.baseTexture) {
            continue;
        }
        const frameSize = variant.frameSize;
        const totalFrames = variant.totalFrames;
        const frameDuration = variant.duration ?? EXPLOSION_FRAME_DURATION;
        const framesPerRow = Math.max(1, Math.floor(texture.baseTexture.width / frameSize));
        const rows = Math.max(1, Math.floor(texture.baseTexture.height / frameSize));
        const availableFrames = Math.min(totalFrames, framesPerRow * rows);
        if (availableFrames <= 0) {
            continue;
        }
        if (!explosion.nextFrameTick) {
            explosion.nextFrameTick = now + frameDuration;
        } else if (now >= explosion.nextFrameTick) {
            explosion.frame = (explosion.frame || 0) + 1;
            explosion.nextFrameTick = now + frameDuration;
        }

        if ((explosion.frame || 0) >= availableFrames) {
            game.explosions.splice(i, 1);
            continue;
        }

        const frameIndex = Math.max(0, explosion.frame || 0);
        const spriteTexture = new PIXI.Texture(
            texture.baseTexture,
            new PIXI.Rectangle(
                (frameIndex % framesPerRow) * frameSize,
                Math.floor(frameIndex / framesPerRow) * frameSize,
                frameSize,
                frameSize
            )
        );

        const sprite = new PIXI.Sprite(spriteTexture);
        const offsetX = game.player.defaultOffset.x - game.player.offset.x;
        const offsetY = game.player.defaultOffset.y - game.player.offset.y;

        sprite.x = (explosion.x || 0) + offsetX;
        sprite.y = (explosion.y || 0) + offsetY;

        stage.addChild(sprite);
    }
};


export const drawChanging = (game) => {


    game.objectContainer.removeChildren();

    drawPlayer(game, game.objectContainer);
    drawOtherPlayers(game, game.objectContainer);
    drawRogueTanks(game, game.objectContainer);
    drawBullets(game, game.objectContainer);
    drawExplosions(game, game.objectContainer);

    const cache = game.__nameLabelCache;
    if (cache && cache.size) {
        const now = game.tick || Date.now();
        for (const [key, record] of cache.entries()) {
            if (!record) {
                cache.delete(key);
                continue;
            }
            const lastUsed = record.lastUsedTick || 0;
            if ((now - lastUsed) <= LABEL_CACHE_TTL_MS) {
                continue;
            }
            if (record.label) {
                if (record.label.parent) {
                    record.label.parent.removeChild(record.label);
                }
                scheduleDestroy(record.label, { minDelay: 16, maxDelay: 200 });
            }
            cache.delete(key);
        }
    }
};

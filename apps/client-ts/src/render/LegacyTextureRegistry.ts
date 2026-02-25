import { Assets, Rectangle, Texture } from "pixi.js";
import { LEGACY_TEXTURE_PATHS, type LegacyTextureKey } from "./parity/texture-paths.js";

export type LegacyTextures = {
    tanks: Texture | null;
    buildings: Texture | null;
    items: Texture | null;
    bullets: Texture | null;
    turretBase: Texture | null;
    turretHead: Texture | null;
    ground: Texture | null;
    rocks: Texture | null;
    lava: Texture | null;
    muzzleFlash: Texture | null;
    interfaceTop: Texture | null;
    interfaceBottom: Texture | null;
    radarColors: Texture | null;
    miniMapColors: Texture | null;
    arrows: Texture | null;
    arrowsRed: Texture | null;
    smallExplosion: Texture | null;
    largeExplosion: Texture | null;
    population: Texture | null;
    research: Texture | null;
    researchComplete: Texture | null;
    smoke: Texture | null;
    health: Texture | null;
    moneyBox: Texture | null;
    moneyUp: Texture | null;
    moneyDown: Texture | null;
    blackNumbers: Texture | null;
    inventorySelection: Texture | null;
    buildIcons: Texture | null;
    buttonStaff: Texture | null;
};

const asTexture = (value: unknown): Texture | null => {
    return value instanceof Texture ? value : null;
};

const safeLoadTexture = async (path: string): Promise<Texture | null> => {
    try {
        const loaded = await Assets.load(path);
        return asTexture(loaded);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/404|not found|enoent/i.test(message)) {
            return null;
        }
        throw error;
    }
};

const loadTextureEntries = async (): Promise<Array<[LegacyTextureKey, Texture | null]>> => {
    const loaded = await Promise.all(
        Object.entries(LEGACY_TEXTURE_PATHS).map(async ([key, path]) => {
            const texture = await safeLoadTexture(path);
            return [key, texture] as [LegacyTextureKey, Texture | null];
        })
    );
    return loaded;
};

export const loadLegacyTextures = async (): Promise<LegacyTextures> => {
    const entries = await loadTextureEntries();
    const textures = Object.fromEntries(entries) as Record<LegacyTextureKey, Texture | null>;
    return {
        ...textures
    };
};

const frameCache = new Map<string, Texture>();

export const getFrameTexture = (
    texture: Texture | null,
    cacheKey: string,
    x: number,
    y: number,
    width: number,
    height: number
): Texture | null => {
    if (!texture || !texture.source) {
        return null;
    }
    const textureWidth = Math.floor(texture.width);
    const textureHeight = Math.floor(texture.height);
    if (
        x < 0
        || y < 0
        || width <= 0
        || height <= 0
        || (x + width) > textureWidth
        || (y + height) > textureHeight
    ) {
        return null;
    }
    const sourceId = texture.source.uid ?? 0;
    const key = `${sourceId}:${cacheKey}:${x}:${y}:${width}:${height}`;
    const cached = frameCache.get(key);
    if (cached) {
        return cached;
    }
    const frame = new Texture({
        source: texture.source,
        frame: new Rectangle(x, y, width, height)
    });
    frameCache.set(key, frame);
    return frame;
};

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

export const createEmptyLegacyTextures = (): LegacyTextures => ({
    tanks: null,
    buildings: null,
    items: null,
    bullets: null,
    turretBase: null,
    turretHead: null,
    ground: null,
    rocks: null,
    lava: null,
    muzzleFlash: null,
    interfaceTop: null,
    interfaceBottom: null,
    radarColors: null,
    miniMapColors: null,
    arrows: null,
    arrowsRed: null,
    smallExplosion: null,
    largeExplosion: null,
    population: null,
    research: null,
    researchComplete: null,
    smoke: null,
    health: null,
    moneyBox: null,
    moneyUp: null,
    moneyDown: null,
    blackNumbers: null,
    inventorySelection: null,
    buildIcons: null,
    buttonStaff: null
});

const asTexture = (value: unknown): Texture | null => {
    return value instanceof Texture ? value : null;
};

const TEXTURE_LOAD_TIMEOUT_MS = 15000;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, path: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`texture load timed out after ${timeoutMs}ms: ${path}`));
                }, timeoutMs);
            })
        ]);
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
};

const safeLoadTexture = async (path: string): Promise<Texture | null> => {
    try {
        if (typeof console !== "undefined" && typeof console.info === "function") {
            console.info(`[render.texture] loading ${path}`);
        }
        const loaded = await withTimeout(Assets.load(path), TEXTURE_LOAD_TIMEOUT_MS, path);
        if (typeof console !== "undefined" && typeof console.info === "function") {
            console.info(`[render.texture] loaded ${path}`);
        }
        return asTexture(loaded);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (typeof console !== "undefined" && typeof console.warn === "function") {
            console.warn(`[render.texture] failed to load ${path}: ${message}`);
        }
        return null;
    }
};

const loadTextureEntries = async (): Promise<Array<[LegacyTextureKey, Texture | null]>> => {
    return Promise.all(
        Object.entries(LEGACY_TEXTURE_PATHS).map(async ([key, path]) => {
            const texture = await safeLoadTexture(path);
            return [key, texture] as [LegacyTextureKey, Texture | null];
        })
    );
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

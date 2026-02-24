import { Assets, Rectangle, Texture } from "pixi.js";

export type LegacyTextures = {
    tanks: Texture | null;
    buildings: Texture | null;
    items: Texture | null;
    bullets: Texture | null;
    turretBase: Texture | null;
    ground: Texture | null;
    rocks: Texture | null;
    lava: Texture | null;
    muzzleFlash: Texture | null;
    interfaceTop: Texture | null;
    interfaceBottom: Texture | null;
    radarColors: Texture | null;
    smallExplosion: Texture | null;
    population: Texture | null;
    research: Texture | null;
    researchComplete: Texture | null;
    smoke: Texture | null;
    health: Texture | null;
    moneyUp: Texture | null;
    moneyDown: Texture | null;
};

const asTexture = (value: unknown): Texture | null => {
    return value instanceof Texture ? value : null;
};

const safeLoadTexture = async (path: string): Promise<Texture | null> => {
    try {
        const loaded = await Assets.load(path);
        return asTexture(loaded);
    } catch {
        return null;
    }
};

export const loadLegacyTextures = async (): Promise<LegacyTextures> => {
    const [tanks, buildings, items, bullets, turretBase, ground, rocks, lava, muzzleFlash, interfaceTop, interfaceBottom, radarColors, smallExplosion, population, research, researchComplete, smoke, health, moneyUp, moneyDown] = await Promise.all([
        safeLoadTexture("/assets/imgTanks.png"),
        safeLoadTexture("/assets/imgBuildings.png"),
        safeLoadTexture("/assets/imgItems.png"),
        safeLoadTexture("/assets/imgbullets.png"),
        safeLoadTexture("/assets/imgTurretBase.png"),
        safeLoadTexture("/assets/imgGround.png"),
        safeLoadTexture("/assets/imgRocks.png"),
        safeLoadTexture("/assets/imgLava.png"),
        safeLoadTexture("/assets/imgMuzzleFlash.png"),
        safeLoadTexture("/assets/imgInterface.png"),
        safeLoadTexture("/assets/imgInterfaceBottom.png"),
        safeLoadTexture("/assets/imgRadarColors.png"),
        safeLoadTexture("/assets/imgSExplosion.png"),
        safeLoadTexture("/assets/imgPopulation.png"),
        safeLoadTexture("/assets/imgResearch.png"),
        safeLoadTexture("/assets/imgResearchComplete.png"),
        safeLoadTexture("/assets/imgSmoke.png"),
        safeLoadTexture("/assets/imgHealth.png"),
        safeLoadTexture("/assets/imgMoneyUp.png"),
        safeLoadTexture("/assets/imgMoneyDown.png")
    ]);
    return {
        tanks,
        buildings,
        items,
        bullets,
        turretBase,
        ground,
        rocks,
        lava,
        muzzleFlash,
        interfaceTop,
        interfaceBottom,
        radarColors,
        smallExplosion,
        population,
        research,
        researchComplete,
        smoke,
        health,
        moneyUp,
        moneyDown
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

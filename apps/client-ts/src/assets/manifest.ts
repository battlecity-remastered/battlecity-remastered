export type AssetManifest = {
    mapData: string;
    spriteSheets: string[];
    audio: string[];
};

export const assetManifest: AssetManifest = {
    mapData: "/assets/map.dat",
    spriteSheets: [
        "/assets/tankTexture.png",
        "/assets/imageItems.png",
        "/assets/buildings.png"
    ],
    audio: [
        "/assets/music-loop.mp3",
        "/assets/sfx-laser.mp3",
        "/assets/sfx-orb.mp3"
    ]
};

export const allAssetPaths = (): string[] => {
    return [assetManifest.mapData, ...assetManifest.spriteSheets, ...assetManifest.audio];
};

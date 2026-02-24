export type AssetManifest = {
    mapData: string;
    spriteSheets: string[];
    audio: string[];
};

export const assetManifest: AssetManifest = {
    mapData: "/assets/map.dat",
    spriteSheets: [
        "/assets/imgTanks.png",
        "/assets/imgBuildings.png",
        "/assets/imgItems.png",
        "/assets/imgbullets.png",
        "/assets/imgGround.png",
        "/assets/imgRocks.png",
        "/assets/imgLava.png",
        "/assets/imgTurretBase.png",
        "/assets/imgTurretHead.png",
        "/assets/imgMuzzleFlash.png",
        "/assets/imgSExplosion.png",
        "/assets/imgLExplosion.png",
        "/assets/imgSmoke.png",
        "/assets/imgRadarColors.png",
        "/assets/imgMiniMapColors.png",
        "/assets/imgHealth.png",
        "/assets/imgBuildIcons.png",
        "/assets/imgPopulation.png"
    ],
    audio: [
        "/assets/wav/laser.wav",
        "/assets/wav/fire.wav",
        "/assets/wav/explode.wav",
        "/assets/wav/engine.wav",
        "/assets/cloak.wav",
        "/assets/flare.wav",
        "/assets/music/bc1.ogg"
    ]
};

export const allAssetPaths = (): string[] => {
    return [assetManifest.mapData, ...assetManifest.spriteSheets, ...assetManifest.audio];
};

export type AssetManifest = {
    mapData: string;
    spriteSheets: string[];
    audio: string[];
};

export const assetManifest: AssetManifest = {
    mapData: "/assets/map.dat",
    spriteSheets: [
        "/assets/imgTanks.png",
        "/assets/skins/BattleCityDX/imgBuildings.png",
        "/assets/imgItems.png",
        "/assets/skins/BattleCityDX/imgBullets.png",
        "/assets/skins/BattleCityDX/imgGround.png",
        "/assets/skins/BattleCityDX/imgRocks.png",
        "/assets/skins/BattleCityDX/imgLava.png",
        "/assets/skins/BattleCityDX/imgTurretBase.png",
        "/assets/skins/BattleCityDX/imgTurretHead.png",
        "/assets/imgMuzzleFlash.png",
        "/assets/imgSExplosion.png",
        "/assets/imgLExplosion.png",
        "/assets/imgSmoke.png",
        "/assets/imgRadarColors.png",
        "/assets/imgMiniMapColors.png",
        "/assets/skins/BattleCityDX/imgHealth.png",
        "/assets/imgBuildIcons.png",
        "/assets/imgPopulation.png",
        "/assets/skins/BattleCityDX/imgInterface.png",
        "/assets/skins/BattleCityDX/imgInterfaceBottom.png",
        "/assets/imgInventorySelection.png",
        "/assets/imgArrows.png",
        "/assets/imgArrowsRed.png",
        "/assets/imgBlackNumbers.png",
        "/assets/imgResearch.png",
        "/assets/imgResearchComplete.png",
        "/assets/skins/BattleCity3.1/imgMoneyBox.png",
        "/assets/skins/BattleCity3.1/imgMoneyUp.png",
        "/assets/skins/BattleCity3.1/imgMoneyDown.png"
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

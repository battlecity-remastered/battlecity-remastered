export const TEXTURE_PATHS = {
    tanks: "/assets/imgTanks.png",
    buildings: "/assets/skins/BattleCityDX/imgBuildings.png",
    items: "/assets/imgItems.png",
    bullets: "/assets/skins/BattleCityDX/imgBullets.png",
    turretBase: "/assets/skins/BattleCityDX/imgTurretBase.png",
    turretHead: "/assets/skins/BattleCityDX/imgTurretHead.png",
    ground: "/assets/skins/BattleCityDX/imgGround.png",
    rocks: "/assets/skins/BattleCityDX/imgRocks.png",
    lava: "/assets/skins/BattleCityDX/imgLava.png",
    muzzleFlash: "/assets/imgMuzzleFlash.png",
    interfaceTop: "/assets/skins/BattleCityDX/imgInterface.png",
    interfaceBottom: "/assets/skins/BattleCityDX/imgInterfaceBottom.png",
    radarColors: "/assets/imgRadarColors.png",
    miniMapColors: "/assets/imgMiniMapColors.png",
    arrows: "/assets/imgArrows.png",
    arrowsRed: "/assets/imgArrowsRed.png",
    smallExplosion: "/assets/imgSExplosion.png",
    largeExplosion: "/assets/imgLExplosion.png",
    population: "/assets/imgPopulation.png",
    research: "/assets/imgResearch.png",
    researchComplete: "/assets/imgResearchComplete.png",
    smoke: "/assets/imgSmoke.png",
    health: "/assets/skins/BattleCityDX/imgHealth.png",
    moneyBox: "/assets/skins/BattleCity3.1/imgMoneyBox.png",
    moneyUp: "/assets/skins/BattleCity3.1/imgMoneyUp.png",
    moneyDown: "/assets/skins/BattleCity3.1/imgMoneyDown.png",
    blackNumbers: "/assets/imgBlackNumbers.png",
    inventorySelection: "/assets/imgInventorySelection.png",
    buildIcons: "/assets/imgBuildIcons.png",
    buttonStaff: "/assets/imgBtnStaff.png"
} as const;

export type TextureKey = keyof typeof TEXTURE_PATHS;

export const parityTextureKeys = (): TextureKey[] => {
    return Object.keys(TEXTURE_PATHS) as TextureKey[];
};

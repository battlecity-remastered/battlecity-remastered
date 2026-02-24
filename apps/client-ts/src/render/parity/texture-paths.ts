export const LEGACY_TEXTURE_PATHS = {
    tanks: "/assets/imgTanks.png",
    buildings: "/assets/imgBuildings.png",
    items: "/assets/imgItems.png",
    bullets: "/assets/imgbullets.png",
    turretBase: "/assets/imgTurretBase.png",
    turretHead: "/assets/imgTurretHead.png",
    ground: "/assets/imgGround.png",
    rocks: "/assets/imgRocks.png",
    lava: "/assets/imgLava.png",
    muzzleFlash: "/assets/imgMuzzleFlash.png",
    interfaceTop: "/assets/imgInterface.png",
    interfaceBottom: "/assets/imgInterfaceBottom.png",
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
    health: "/assets/imgHealth.png",
    moneyBox: "/assets/imgMoneyBox.png",
    moneyUp: "/assets/imgMoneyUp.png",
    moneyDown: "/assets/imgMoneyDown.png",
    blackNumbers: "/assets/imgBlackNumbers.png",
    inventorySelection: "/assets/imgInventorySelection.png",
    buildIcons: "/assets/imgBuildIcons.png",
    buttonStaff: "/assets/imgBtnStaff.png"
} as const;

export type LegacyTextureKey = keyof typeof LEGACY_TEXTURE_PATHS;

export const parityTextureKeys = (): LegacyTextureKey[] => {
    return Object.keys(LEGACY_TEXTURE_PATHS) as LegacyTextureKey[];
};

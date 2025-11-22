const CANT_BUILD = 0;
const CAN_BUILD = 1;
const HAS_BUILT = 2;
const RESEARCH_PENDING = 3;

const BUILD_TREE_CONFIG = [
    { key: 'CAN_BUILD_HOUSE', type: 300, label: 'Housing', icon: 0, image: 3, parent: 0, initial: CAN_BUILD },
    { key: 'CAN_BUILD_LASER_RESEARCH', type: 412, label: 'Laser Research', icon: 1, image: 4, parent: 300, initial: CAN_BUILD },
    { key: 'CAN_BUILD_LASER_FACTORY', type: 112, label: 'Laser Factory', icon: 1, image: 1, parent: 412, initial: CANT_BUILD },
    { key: 'CAN_BUILD_BAZOOKA_RESEARCH', type: 401, label: 'Bazooka Research', icon: 2, image: 4, parent: 300, initial: CAN_BUILD },
    { key: 'CAN_BUILD_BAZOOKA_FACTORY', type: 101, label: 'Bazooka Factory', icon: 2, image: 1, parent: 401, initial: CANT_BUILD },
    { key: 'CAN_BUILD_TURRET_RESEARCH', type: 409, label: 'Turret Research', icon: 9, image: 4, parent: 300, initial: CAN_BUILD },
    { key: 'CAN_BUILD_TURRET_FACTORY', type: 109, label: 'Turret Factory', icon: 9, image: 1, parent: 409, initial: CANT_BUILD },
    { key: 'CAN_BUILD_CLOAK_RESEARCH', type: 400, label: 'Cloak Research', icon: 1, image: 4, parent: 401, initial: CANT_BUILD },
    { key: 'CAN_BUILD_CLOAK_FACTORY', type: 100, label: 'Cloak Factory', icon: 1, image: 1, parent: 400, initial: CANT_BUILD },
    { key: 'CAN_BUILD_MEDKIT_RESEARCH', type: 402, label: 'MedKit Research', icon: 3, image: 4, parent: 401, initial: CANT_BUILD },
    { key: 'CAN_BUILD_MEDKIT_FACTORY', type: 102, label: 'MedKit Factory', icon: 3, image: 1, parent: 402, initial: CANT_BUILD },
    { key: 'CAN_BUILD_HOSPITAL', type: 200, label: 'Hospital', icon: 12, image: 2, parent: 402, initial: CANT_BUILD },
    { key: 'CAN_BUILD_PLASMA_RESEARCH', type: 411, label: 'Plasma Turret Research', icon: 10, image: 4, parent: 409, initial: CANT_BUILD },
    { key: 'CAN_BUILD_PLASMA_FACTORY', type: 111, label: 'Plasma Turret Factory', icon: 10, image: 1, parent: 411, initial: CANT_BUILD },
    { key: 'CAN_BUILD_MINE_RESEARCH', type: 404, label: 'Mine Research', icon: 5, image: 4, parent: 409, initial: CANT_BUILD },
    { key: 'CAN_BUILD_MINE_FACTORY', type: 104, label: 'Mine Factory', icon: 5, image: 1, parent: 404, initial: CANT_BUILD },
    { key: 'CAN_BUILD_ORB_RESEARCH', type: 405, label: 'Orb Research', icon: 6, image: 4, parent: 400, initial: CANT_BUILD },
    { key: 'CAN_BUILD_ORB_FACTORY', type: 105, label: 'Orb Factory', icon: 6, image: 1, parent: 405, initial: CANT_BUILD },
    { key: 'CAN_BUILD_BOMB_RESEARCH', type: 403, label: 'Time Bomb Research', icon: 4, image: 4, parent: 400, initial: CANT_BUILD },
    { key: 'CAN_BUILD_BOMB_FACTORY', type: 103, label: 'Time Bomb Factory', icon: 4, image: 1, parent: 403, initial: CANT_BUILD },
    { key: 'CAN_BUILD_SLEEPER_RESEARCH', type: 410, label: 'Sleeper Research', icon: 11, image: 4, parent: 411, initial: CANT_BUILD },
    { key: 'CAN_BUILD_SLEEPER_FACTORY', type: 110, label: 'Sleeper Factory', icon: 11, image: 1, parent: 410, initial: CANT_BUILD },
    { key: 'CAN_BUILD_WALL_RESEARCH', type: 413, label: 'Wall Research', icon: 8, image: 4, parent: 411, initial: CANT_BUILD },
    { key: 'CAN_BUILD_WALL_FACTORY', type: 108, label: 'Wall Factory', icon: 8, image: 1, parent: 413, initial: CANT_BUILD },
    { key: 'CAN_BUILD_DFG_RESEARCH', type: 406, label: 'DFG Research', icon: 7, image: 4, parent: 404, initial: CANT_BUILD },
    { key: 'CAN_BUILD_DFG_FACTORY', type: 107, label: 'DFG Factory', icon: 7, image: 1, parent: 406, initial: CANT_BUILD },
    { key: 'CAN_BUILD_FLARE_RESEARCH', type: 407, label: 'Flare Gun Research', icon: 7, image: 4, parent: 405, initial: CANT_BUILD },
    { key: 'CAN_BUILD_FLARE_FACTORY', type: 106, label: 'Flare Gun Factory', icon: 7, image: 1, parent: 407, initial: CANT_BUILD },
];

const DEPENDENCY_TREE = BUILD_TREE_CONFIG.map((entry) => ({
    id: entry.type,
    parentid: entry.parent ?? 0,
}));

const LABELS = BUILD_TREE_CONFIG.reduce((acc, entry) => {
    acc[entry.key] = {
        ICON: entry.icon,
        IMAGE: entry.image,
        TYPE: entry.type,
        LABEL: entry.label,
    };
    return acc;
}, {});

const DEFAULT_CITY_CAN_BUILD = Object.freeze(
    BUILD_TREE_CONFIG.reduce((acc, entry) => {
        acc[entry.key] = entry.initial ?? CANT_BUILD;
        return acc;
    }, {})
);

module.exports = {
    BUILD_TREE_CONFIG,
    DEPENDENCY_TREE,
    LABELS,
    DEFAULT_CITY_CAN_BUILD,
    CANT_BUILD,
    CAN_BUILD,
    HAS_BUILT,
    RESEARCH_PENDING,
};

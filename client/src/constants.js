export const RESOLUTION_X = 1024;
export const RESOLUTION_Y = 768;

export const RADAR_RANGE_PX = 2400;
export const RADAR_RATIO = 24;
export const RADAR_CENTER_OFFSET_X = 100;
export const RADAR_CENTER_Y = 80;
export const RADAR_BOUNDS = Object.freeze({
    offsetX: 28,
    offsetY: 8,
    width: 138,
    height: 138,
});
export const RADAR_OFFSET_ADJUST_X = 70;
export const RADAR_OFFSET_ADJUST_Y = 69;


export const MOVEMENT_SPEED_PLAYER = 0.50;
export const MOVEMENT_SPEED_BULLET = 0.80;
export const BULLET_RANGE_DEFAULT = 3000;
export const BULLET_RANGE_FLARE = 48;

export const COLLISION_BLOCKING = 2;
export const COLLISION_MINE = 101;
export const COLLISION_MAP_EDGE_LEFT = 200;
export const COLLISION_MAP_EDGE_RIGHT = 201;
export const COLLISION_MAP_EDGE_TOP = 202;
export const COLLISION_MAP_EDGE_BOTTOM = 203;
export const COLLISION_DFG = 103;


export const BULLET_ALIVE = 1;
export const BULLET_DEAD = -1;
export const TIMER_SHOOT_LASER = 650;
export const TIMER_SHOOT_ROCKET = 650;
export const TIMER_SHOOT_FLARE = 500;
export const TIMER_BOMB = 5000;
export const TIMER_CLOAK = 5000;
export const TIMER_DFG = 5000;
export const TIMER_RESEARCH = 10000;

export const DAMAGE_LASER = 5;
export const DAMAGE_ROCKET = 8;
export const DAMAGE_MINE = 19;
export const DAMAGE_BOMB = 40;
export const DAMAGE_FLARE = 5;

export const MAX_HEALTH = 40;
export const MONEY_STARTING_VALUE = 95000000;
export const MONEY_MAX_VALUE = 95000000;
export const MONEY_TICK_INTERVAL = 7000;
export const COST_BUILDING = 500000;
export const COST_ITEM = 750000;
export const COST_INCOME_POPULATION = 10000;
export const COST_UPKEEP_HOSPITAL = 2000000;
export const BOMB_EXPLOSION_TILE_RADIUS = 2;
export const BOMB_ITEM_TILE_RADIUS = 1;

export const MAP_SQUARE_LAVA = 1;
export const MAP_SQUARE_ROCK = 2;
export const MAP_SQUARE_BUILDING = 3;
export const MOVEMENT_SPEED_FLARE = 0.10;

export const BUILDING_COMMAND_CENTER = 0;
export const BUILDING_FACTORY = 1;
export const BUILDING_REPAIR = 2;
export const BUILDING_HOUSE = 3;
export const BUILDING_RESEARCH = 4;

export const BUILDING_HAS_BAY = 2;

export const POPULATION_MAX_HOUSE = 100;
export const POPULATION_MAX_NON_HOUSE = 50;

export const CANT_BUILD = 0;
export const CAN_BUILD = 1;
export const HAS_BUILT = 2;
export const RESEARCH_PENDING = 3;

export const CAN_BUILD_HOSPITAL = 200;
export const CAN_BUILD_HOUSE = 300;

export const CAN_BUILD_LASER_RESEARCH = 412;
export const CAN_BUILD_LASER_FACTORY = 112;
export const CAN_BUILD_BAZOOKA_RESEARCH = 401;
export const CAN_BUILD_BAZOOKA_FACTORY = 101;
export const CAN_BUILD_TURRET_RESEARCH = 409;
export const CAN_BUILD_TURRET_FACTORY = 109;
export const CAN_BUILD_CLOAK_RESEARCH = 400;
export const CAN_BUILD_CLOAK_FACTORY = 100;
export const CAN_BUILD_MEDKIT_RESEARCH = 402;
export const CAN_BUILD_MEDKIT_FACTORY = 102;
export const CAN_BUILD_PLASMA_RESEARCH = 411;
export const CAN_BUILD_PLASMA_FACTORY = 111;
export const CAN_BUILD_MINE_RESEARCH = 404;
export const CAN_BUILD_MINE_FACTORY = 104;
export const CAN_BUILD_ORB_RESEARCH = 405;
export const CAN_BUILD_ORB_FACTORY = 105;
export const CAN_BUILD_BOMB_RESEARCH = 403;
export const CAN_BUILD_BOMB_FACTORY = 103;
export const CAN_BUILD_SLEEPER_RESEARCH = 410;
export const CAN_BUILD_SLEEPER_FACTORY = 110;
export const CAN_BUILD_WALL_RESEARCH = 408;
export const CAN_BUILD_WALL_FACTORY = 108;
export const CAN_BUILD_DFG_RESEARCH = 407;
export const CAN_BUILD_DFG_FACTORY = 107;
export const CAN_BUILD_FLARE_RESEARCH = 406;
export const CAN_BUILD_FLARE_FACTORY = 106;

export const ITEM_TYPE_CLOAK = 0;
export const ITEM_TYPE_ROCKET = 1;
export const ITEM_TYPE_MEDKIT = 2;
export const ITEM_TYPE_BOMB = 3;
export const ITEM_TYPE_MINE = 4;
export const ITEM_TYPE_ORB = 5;
export const ITEM_TYPE_FLARE = 6;
export const ITEM_TYPE_DFG = 7;
export const ITEM_TYPE_WALL = 8;
export const ITEM_TYPE_TURRET = 9;
export const ITEM_TYPE_SLEEPER = 10;
export const ITEM_TYPE_PLASMA = 11;
export const ITEM_TYPE_LASER = 12;

export const ITEM_INITIAL_LIFE = Object.freeze({
    [ITEM_TYPE_WALL]: 40,
    [ITEM_TYPE_TURRET]: 32,
    [ITEM_TYPE_SLEEPER]: 16,
    [ITEM_TYPE_PLASMA]: 40,
});

export const ITEM_BURN_THRESHOLDS = Object.freeze({
    [ITEM_TYPE_WALL]: 20,
    [ITEM_TYPE_TURRET]: 8,
    [ITEM_TYPE_SLEEPER]: 16,
    [ITEM_TYPE_PLASMA]: 20,
});

export const ITEM_TYPE_LIMITS = {
    [ITEM_TYPE_CLOAK]: 4,
    [ITEM_TYPE_ROCKET]: 4,
    [ITEM_TYPE_MEDKIT]: 5,
    [ITEM_TYPE_BOMB]: 20,
    [ITEM_TYPE_MINE]: 10,
    [ITEM_TYPE_ORB]: 1,
    [ITEM_TYPE_FLARE]: 4,
    [ITEM_TYPE_DFG]: 5,
    [ITEM_TYPE_WALL]: 20,
    [ITEM_TYPE_TURRET]: 10,
    [ITEM_TYPE_SLEEPER]: 5,
    [ITEM_TYPE_PLASMA]: 5,
    [ITEM_TYPE_LASER]: 4,
};

export const BUILD_TREE_CONFIG = [
    {
        key: 'CAN_BUILD_HOSPITAL',
        type: CAN_BUILD_HOSPITAL,
        label: 'Hospital',
        icon: 12,
        image: BUILDING_REPAIR,
        parent: CAN_BUILD_MEDKIT_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_HOUSE',
        type: CAN_BUILD_HOUSE,
        label: 'Housing',
        icon: 0,
        image: BUILDING_HOUSE,
        parent: 0,
        initial: CAN_BUILD,
    },
    {
        key: 'CAN_BUILD_LASER_RESEARCH',
        type: CAN_BUILD_LASER_RESEARCH,
        label: 'Laser Research',
        icon: 1,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_HOUSE,
        initial: CAN_BUILD,
    },
    {
        key: 'CAN_BUILD_LASER_FACTORY',
        type: CAN_BUILD_LASER_FACTORY,
        label: 'Laser Factory',
        icon: 1,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_LASER_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_BAZOOKA_RESEARCH',
        type: CAN_BUILD_BAZOOKA_RESEARCH,
        label: 'Bazooka Research',
        icon: 2,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_HOUSE,
        initial: CAN_BUILD,
    },
    {
        key: 'CAN_BUILD_BAZOOKA_FACTORY',
        type: CAN_BUILD_BAZOOKA_FACTORY,
        label: 'Bazooka Factory',
        icon: 2,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_BAZOOKA_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_TURRET_RESEARCH',
        type: CAN_BUILD_TURRET_RESEARCH,
        label: 'Turret Research',
        icon: 9,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_HOUSE,
        initial: CAN_BUILD,
    },
    {
        key: 'CAN_BUILD_TURRET_FACTORY',
        type: CAN_BUILD_TURRET_FACTORY,
        label: 'Turret Factory',
        icon: 9,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_TURRET_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_CLOAK_RESEARCH',
        type: CAN_BUILD_CLOAK_RESEARCH,
        label: 'Cloak Research',
        icon: 1,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_BAZOOKA_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_CLOAK_FACTORY',
        type: CAN_BUILD_CLOAK_FACTORY,
        label: 'Cloak Factory',
        icon: 1,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_CLOAK_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_MEDKIT_RESEARCH',
        type: CAN_BUILD_MEDKIT_RESEARCH,
        label: 'MedKit Research',
        icon: 3,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_BAZOOKA_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_MEDKIT_FACTORY',
        type: CAN_BUILD_MEDKIT_FACTORY,
        label: 'MedKit Factory',
        icon: 3,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_MEDKIT_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_PLASMA_RESEARCH',
        type: CAN_BUILD_PLASMA_RESEARCH,
        label: 'Plasma Turret Research',
        icon: 10,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_TURRET_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_PLASMA_FACTORY',
        type: CAN_BUILD_PLASMA_FACTORY,
        label: 'Plasma Turret Factory',
        icon: 10,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_PLASMA_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_MINE_RESEARCH',
        type: CAN_BUILD_MINE_RESEARCH,
        label: 'Mine Research',
        icon: 5,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_TURRET_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_MINE_FACTORY',
        type: CAN_BUILD_MINE_FACTORY,
        label: 'Mine Factory',
        icon: 5,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_MINE_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_ORB_RESEARCH',
        type: CAN_BUILD_ORB_RESEARCH,
        label: 'Orb Research',
        icon: 6,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_CLOAK_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_ORB_FACTORY',
        type: CAN_BUILD_ORB_FACTORY,
        label: 'Orb Factory',
        icon: 6,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_ORB_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_BOMB_RESEARCH',
        type: CAN_BUILD_BOMB_RESEARCH,
        label: 'Time Bomb Research',
        icon: 4,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_CLOAK_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_BOMB_FACTORY',
        type: CAN_BUILD_BOMB_FACTORY,
        label: 'Time Bomb Factory',
        icon: 4,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_BOMB_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_SLEEPER_RESEARCH',
        type: CAN_BUILD_SLEEPER_RESEARCH,
        label: 'Sleeper Research',
        icon: 8,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_PLASMA_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_SLEEPER_FACTORY',
        type: CAN_BUILD_SLEEPER_FACTORY,
        label: 'Sleeper Factory',
        icon: 8,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_SLEEPER_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_WALL_RESEARCH',
        type: CAN_BUILD_WALL_RESEARCH,
        label: 'Wall Research',
        icon: 11,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_PLASMA_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_WALL_FACTORY',
        type: CAN_BUILD_WALL_FACTORY,
        label: 'Wall Factory',
        icon: 11,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_WALL_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_DFG_RESEARCH',
        type: CAN_BUILD_DFG_RESEARCH,
        label: 'DFG Research',
        icon: 8,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_MINE_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_DFG_FACTORY',
        type: CAN_BUILD_DFG_FACTORY,
        label: 'DFG Factory',
        icon: 8,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_DFG_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_FLARE_RESEARCH',
        type: CAN_BUILD_FLARE_RESEARCH,
        label: 'Flare Gun Research',
        icon: 7,
        image: BUILDING_RESEARCH,
        parent: CAN_BUILD_ORB_RESEARCH,
        initial: CANT_BUILD,
    },
    {
        key: 'CAN_BUILD_FLARE_FACTORY',
        type: CAN_BUILD_FLARE_FACTORY,
        label: 'Flare Gun Factory',
        icon: 7,
        image: BUILDING_FACTORY,
        parent: CAN_BUILD_FLARE_RESEARCH,
        initial: CANT_BUILD,
    },
];

export const DEPENDENCY_TREE = BUILD_TREE_CONFIG.map((entry) => ({
    id: entry.type,
    parentid: entry.parent ?? 0,
}));

export const LABELS = BUILD_TREE_CONFIG.reduce((acc, entry) => {
    acc[entry.key] = {
        ICON: entry.icon,
        IMAGE: entry.image,
        TYPE: entry.type,
        LABEL: entry.label,
    };
    return acc;
}, {});

export const DEFAULT_CITY_CAN_BUILD = Object.freeze(
    BUILD_TREE_CONFIG.reduce((acc, entry) => {
        acc[entry.key] = entry.initial ?? CANT_BUILD;
        return acc;
    }, {})
);

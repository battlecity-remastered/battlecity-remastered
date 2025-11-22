import {CAN_BUILD_HOSPITAL} from "../constants.js";
import {BUILDING_REPAIR} from "../constants.js";

const TILE_SIZE = 48;

const parseNumericType = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return NaN;
};

const HOSPITAL_TYPE_CODES = new Set([CAN_BUILD_HOSPITAL, 301]);

export const isHospitalBuilding = (buildingOrType) => {
    const typeValue = (buildingOrType && typeof buildingOrType === 'object')
        ? buildingOrType.type
        : buildingOrType;
    const numericType = parseNumericType(typeValue);
    if (!Number.isFinite(numericType)) {
        return false;
    }
    if (HOSPITAL_TYPE_CODES.has(numericType)) {
        return true;
    }
    const family = Math.floor(numericType / 100);
    return family === BUILDING_REPAIR && numericType >= 200 && numericType < 300;
};

export const getHospitalDriveableRect = (building) => {
    if (!building) {
        return null;
    }
    const baseX = Number.isFinite(building.x) ? building.x : parseInt(building.x, 10) || 0;
    const baseY = Number.isFinite(building.y) ? building.y : parseInt(building.y, 10) || 0;
    return {
        x: baseX * TILE_SIZE,
        y: (baseY * TILE_SIZE) + (TILE_SIZE * 2),
        w: TILE_SIZE * 3,
        h: TILE_SIZE,
    };
};

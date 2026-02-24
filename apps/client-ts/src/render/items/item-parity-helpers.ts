import {
    ITEM_FRAME_SIZE,
    ITEM_ICON_FRAME_SIZE,
    ITEM_TYPE_BOMB,
    ITEM_TYPE_MINE,
    ITEM_TYPE_ORB,
    ITEM_TYPE_WALL
} from "../parity/constants.js";

export const resolveHazardSortKey = (type: number): number => {
    if (type === ITEM_TYPE_MINE) {
        return 10;
    }
    if (type === ITEM_TYPE_WALL) {
        return 30;
    }
    return 20;
};

export const resolveHazardOffset = (type: number): { x: number; y: number } => {
    if (type === ITEM_TYPE_MINE) {
        return { x: 8, y: 8 };
    }
    if (type === ITEM_TYPE_ORB) {
        return { x: 4, y: 0 };
    }
    return { x: 0, y: 0 };
};

export const resolveBulletFrameRect = (animation: number, type: number): { x: number; y: number; width: number; height: number } => {
    return {
        x: animation * 8,
        y: type * 8,
        width: 8,
        height: 8
    };
};

export const resolveHazardFrameRect = (
    type: number,
    animation: number,
    bombArmed: boolean
): { x: number; y: number; width: number; height: number } => {
    if (type === ITEM_TYPE_MINE) {
        return {
            x: type * ITEM_ICON_FRAME_SIZE,
            y: 0,
            width: ITEM_ICON_FRAME_SIZE,
            height: ITEM_ICON_FRAME_SIZE
        };
    }
    if (type === ITEM_TYPE_BOMB && bombArmed) {
        return { x: 144, y: 91, width: 48, height: 48 };
    }
    if (type === ITEM_TYPE_ORB) {
        return { x: ITEM_TYPE_ORB * ITEM_FRAME_SIZE, y: 42 + (animation * ITEM_FRAME_SIZE), width: 48, height: 48 };
    }
    return { x: type * ITEM_FRAME_SIZE, y: 42, width: 48, height: 48 };
};

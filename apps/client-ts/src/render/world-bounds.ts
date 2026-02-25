export type WorldViewBounds = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

export const resolveWorldViewBounds = (
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    overscanPx: number = 0
): WorldViewBounds => {
    const halfWidth = Math.max(0, width / 2) + Math.max(0, overscanPx);
    const halfHeight = Math.max(0, height / 2) + Math.max(0, overscanPx);
    return {
        left: centerX - halfWidth,
        top: centerY - halfHeight,
        right: centerX + halfWidth,
        bottom: centerY + halfHeight
    };
};

export const isWorldRectVisible = (
    bounds: WorldViewBounds,
    x: number,
    y: number,
    width: number,
    height: number
): boolean => {
    return (x + width) >= bounds.left
        && x <= bounds.right
        && (y + height) >= bounds.top
        && y <= bounds.bottom;
};

export const isWorldPointVisible = (
    bounds: WorldViewBounds,
    x: number,
    y: number,
    padding: number = 0
): boolean => {
    const safePadding = Math.max(0, padding);
    return (x + safePadding) >= bounds.left
        && (x - safePadding) <= bounds.right
        && (y + safePadding) >= bounds.top
        && (y - safePadding) <= bounds.bottom;
};

export type Rect = {
    x: number;
    y: number;
    w: number;
    h: number;
};

export const rectangleCollision = (a: Rect, b: Rect): boolean => {
    return (
        a.x < b.x + b.w
        && a.x + a.w > b.x
        && a.y < b.y + b.h
        && a.y + a.h > b.y
    );
};

export const clamp = (value: number, min: number, max: number): number => {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

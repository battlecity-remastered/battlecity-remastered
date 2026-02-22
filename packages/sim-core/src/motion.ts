export const normalizeHeading32 = (direction: number): number => {
    const wrapped = Math.floor(direction) % 32;
    return wrapped < 0 ? wrapped + 32 : wrapped;
};

export const heading32ToRadians = (direction: number): number => {
    return (normalizeHeading32(direction) / 32) * (Math.PI * 2);
};

export const advancePointByHeading32 = (
    x: number,
    y: number,
    direction: number,
    speed: number,
    dtMs: number
): { x: number; y: number } => {
    const radians = heading32ToRadians(direction);
    const distance = speed * (dtMs / 1000);
    return {
        x: x + (Math.cos(radians) * distance),
        y: y + (Math.sin(radians) * distance)
    };
};

export const distanceSquared = (
    a: { x: number; y: number },
    b: { x: number; y: number }
): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return (dx * dx) + (dy * dy);
};

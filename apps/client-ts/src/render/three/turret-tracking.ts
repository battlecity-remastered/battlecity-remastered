const TAU = Math.PI * 2;
// Rendered yaw deltas normally span at most one turn. Avoid three trig calls
// in that range; retain native argument reduction for unusually large angles.
export const wrapSignedAngle = (angle: number): number => {
    if (angle >= -Math.PI && angle <= Math.PI) return angle;
    if (angle > Math.PI && angle <= Math.PI * 3) return angle - TAU;
    if (angle < -Math.PI && angle >= -Math.PI * 3) return angle + TAU;
    return Math.atan2(Math.sin(angle), Math.cos(angle));
};

// Take the shortest path through the angle wrap and limit servo speed.
export const trackAngle = (current: number,target: number,dt: number,maxSpeed = 4.8): number => {
    const difference=wrapSignedAngle(target-current);
    const eased=difference*(1-Math.exp(-12*Math.max(0,dt)));
    const step=Math.max(-maxSpeed*dt,Math.min(maxSpeed*dt,eased));
    return wrapSignedAngle(current+step);
};

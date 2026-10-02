import * as THREE from "three";
import { SHELL_SPEED, type CombatPoint, type ShellSweep } from "./demo-combat.js";
import { trackAngle, wrapSignedAngle } from "./turret-tracking.js";

export const createDefenseTurrets = (tank: THREE.Object3D, sweep: ShellSweep, launch: (muzzle: CombatPoint, forward: CombatPoint) => void) => {
    const turrets: Array<{ root: THREE.Object3D; head: THREE.Object3D; pitch: THREE.Object3D; gun: THREE.Object3D; muzzle: THREE.Object3D; rest: THREE.Vector3; glow: THREE.MeshStandardMaterial[]; lastFire: number; nextFire: number; remaining: number }> = [];
    const target = new THREE.Vector3(), origin = new THREE.Vector3(), muzzle = new THREE.Vector3(), aim = new THREE.Vector3(), forward = new THREE.Vector3();
    const quaternion = new THREE.Quaternion(), velocity = new THREE.Vector3(), previous = new THREE.Vector3(), measured = new THREE.Vector3();
    let lastTime = performance.now() / 1000, initialized = false;
    const fireTurret = (turret: typeof turrets[number], i: number, seconds: number, inRange: boolean, obstructed: boolean, aligned: boolean, lineStart: THREE.Vector3): void => {
        const charge = THREE.MathUtils.clamp(1 - (turret.nextFire - seconds) / 0.7, 0, 1);
        const glowIntensity = 0.45 + (inRange ? charge * 1.2 : 0.12 * Math.sin(seconds * 2 + i));
        for (const glow of turret.glow) glow.emissiveIntensity = glowIntensity;
        if (inRange && !obstructed && aligned && seconds >= turret.nextFire) {
            launch(lineStart, forward);
            turret.lastFire = seconds;
            if (turret.remaining === 0) turret.remaining = 2;
            turret.remaining--;
            turret.nextFire = seconds + (turret.remaining > 0 ? 0.18 : 1.30 + i * 0.11);
        }
    };
    return {
        register: (root: THREE.Object3D): void => {
            const parts = new Map<string, THREE.Object3D>();
            const glows = new Map<THREE.Material, THREE.MeshStandardMaterial>();
            root.traverse(part => {
                if (part.userData.role) parts.set(part.userData.role, part);
                if (part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial && part.material.name === "Command glow") {
                    const source = part.material;
                    let glow = glows.get(source);
                    if (!glow) { glow = source.clone(); glow.onBeforeCompile = source.onBeforeCompile; glow.customProgramCacheKey = source.customProgramCacheKey; glows.set(source, glow); }
                    part.material = glow;
                }
            });
            const head = parts.get("defense-head"), pitch = parts.get("defense-pitch"), gun = parts.get("defense-gun"), muzzle = parts.get("defense-muzzle");
            if (!head || !pitch || !gun || !muzzle) throw new Error("Defense turret is missing its articulated Blender attachments");
            head.rotation.y = turrets.length * 0.8;
            turrets.push({ root, head, pitch, gun, muzzle, rest: gun.position.clone(), glow: [...glows.values()], lastFire: -100, nextFire: performance.now() / 1000 + 0.8 + turrets.length * 0.35, remaining: 0 });
        },
        unregister: (root: THREE.Object3D): void => { const index = turrets.findIndex(turret => turret.root === root); if (index >= 0) { for (const material of turrets[index]!.glow) material.dispose(); turrets.splice(index, 1); } },
        update: (seconds: number, dt: number) => {
            const elapsed = Math.max(0.001, seconds - lastTime); lastTime = seconds;
            if (initialized) {
                measured.copy(tank.position).sub(previous).divideScalar(elapsed);
                measured.y = 0; measured.clampLength(0, 16);
                velocity.lerp(measured, 1 - Math.exp(-elapsed * 7));
            }
            previous.copy(tank.position); initialized = true;
            let tracking = 0, visible = 0;
            for (let i = 0; i < turrets.length; i++) {
                const turret = turrets[i]!;
                turret.head.getWorldPosition(origin);
                const dx = tank.position.x - origin.x, dz = tank.position.z - origin.z, rangeSquared = dx * dx + dz * dz;
                const inRange = rangeSquared > 1.3 * 1.3 && rangeSquared < 12 * 12;
                if (inRange) {
                    target.copy(tank.position); target.y = 0.28;
                    target.addScaledVector(velocity, Math.hypot(dx, dz) / SHELL_SPEED * 0.65);
                    aim.subVectors(target, origin);
                }
                const yaw = inRange ? -Math.atan2(aim.x, -aim.z) : Math.sin(seconds * 0.42 + i * 1.6) * 1.5;
                const elevation = inRange ? THREE.MathUtils.clamp(Math.atan2(aim.y, Math.hypot(aim.x, aim.z)), -0.55, 0.16) : Math.sin(seconds * 0.55 + i) * 0.04;
                turret.head.rotation.y = trackAngle(turret.head.rotation.y, yaw, dt);
                turret.pitch.rotation.x = trackAngle(turret.pitch.rotation.x, elevation, dt, 1.9);
                const shotAge = seconds - turret.lastFire;
                const recoil = Math.exp(-shotAge * 18) * (1 + Math.max(0, shotAge) * 18);
                turret.gun.position.copy(turret.rest); turret.gun.position.z += recoil * 0.055;
                turret.root.updateWorldMatrix(true, true);
                turret.muzzle.getWorldPosition(muzzle);
                forward.set(0, 0, -1).applyQuaternion(turret.muzzle.getWorldQuaternion(quaternion));
                const lineStart = muzzle.clone().addScaledVector(forward, 0.012);
                const obstructed = inRange ? sweep(lineStart, target) : true;
                const aligned = Math.abs(wrapSignedAngle(yaw - turret.head.rotation.y)) < 0.09
                    && Math.abs(elevation - turret.pitch.rotation.x) < 0.08;
                if (inRange) tracking++;
                if (inRange && !obstructed) visible++;
                fireTurret(turret, i, seconds, inRange, Boolean(obstructed), aligned, lineStart);
            }
            return { tracking, visible, count: turrets.length };
        }
    };
};

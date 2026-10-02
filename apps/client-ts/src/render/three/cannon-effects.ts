import * as THREE from "three";
import { createCannonAudio } from "./cannon-audio.js";
import { fragmentShader1, fragmentShader2, vertexShader1 } from "./cannon-effects-shaders.js";
import { createDemoCombat, TANK_MUZZLE_DISTANCE, TANK_MUZZLE_HEIGHT, WEAPON_PROFILES, type CannonShot, type CombatPoint, type DemoWeapon, type ShellHit, type ShellSweep } from "./demo-combat.js";
import { createDestructionEffects } from "./destruction-effects.js";
import type { NetworkCombatFrame } from "./network-combat.js";

const PARTICLES = 512, PROJECTILES = 16;
type Particle = { active: boolean; position: THREE.Vector3; velocity: THREE.Vector3; age: number; life: number; size: number; kind: number; color: THREE.Color };

export const createCannonEffects = (scene: THREE.Scene, tank: THREE.Object3D, sweep: ShellSweep, audioEnabled: () => boolean, groundHeight: (x: number, z: number) => number) => {
    const combat = createDemoCombat(sweep), audio = createCannonAudio(audioEnabled);
    const destruction = createDestructionEffects(scene, groundHeight);
    const direction = new THREE.Vector3(), muzzle = new THREE.Vector3(), normal = new THREE.Vector3();
    let socket: THREE.Object3D | undefined;
    tank.traverse(part => { if (part.userData.role === "tank-muzzle") socket = part; });
    const guns: Array<{ part: THREE.Object3D; rest: THREE.Vector3 }> = []; tank.traverse(part => { if (part.userData.role === "tank-gun") guns.push({ part, rest: part.position.clone() }); });
    let recoilAge = 10, particleCursor = 0, flashCursor = 0, markCursor = 0;
    let shotsFired = 0, impactCount = 0, metalImpacts = 0, rockImpacts = 0;
    let turretShots = 0, tankHits = 0, muzzleLightAge = 10;
    const pendingShots: CannonShot[] = [];
    let lastSimulationTime = performance.now() / 1000;

    const shellGeometry = new THREE.CapsuleGeometry(0.017, 0.18, 2, 6);
    const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xffcf86, metalness: 0.65, roughness: 0.25, emissive: new THREE.Color(2.6, 0.8, 0.12), emissiveIntensity: 1 });
    const shells = new THREE.InstancedMesh(shellGeometry, shellMaterial, PROJECTILES);
    const laserTrails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3, 4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), PROJECTILES);
    laserTrails.count = 0; laserTrails.frustumCulled = false; scene.add(laserTrails);
    shells.count = 0; shells.frustumCulled = false;
    scene.add(shells);
    const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);

    const positions = new Float32Array(PARTICLES * 3), colors = new Float32Array(PARTICLES * 3), sizes = new Float32Array(PARTICLES), opacities = new Float32Array(PARTICLES), kinds = new Float32Array(PARTICLES);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("particleColor", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("particleSize", new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("particleOpacity", new THREE.BufferAttribute(opacities, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("particleKind", new THREE.BufferAttribute(kinds, 1));
    const particles = Array.from({ length: PARTICLES }, (): Particle => ({ active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, life: 0, size: 0, kind: 0, color: new THREE.Color() }));
    const particleMaterial = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { particleRatio: { value: Math.min(window.devicePixelRatio, 1.75) } },
        vertexShader: vertexShader1,
        fragmentShader: fragmentShader1
    });
    const cloud = new THREE.Points(geometry, particleMaterial); cloud.frustumCulled = false; scene.add(cloud);

    const coneGeometry = new THREE.ConeGeometry(0.10, 0.34, 16); coneGeometry.translate(0, 0.17, 0);
    const hotGeometry = new THREE.SphereGeometry(0.034, 12, 8);
    const flashes = Array.from({ length: 8 }, (_, i) => {
        const material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { flashLife: { value: 0 }, flashSeed: { value: i * 7.3 }, laserFlash: { value: 0 } },
            vertexShader: `varying vec2 flashUv;void main(){flashUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
            fragmentShader: fragmentShader2
        });
        const root = new THREE.Group(); root.visible = false;
        root.add(new THREE.Mesh(coneGeometry, material));
        const core = new THREE.Mesh(hotGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.7, 0.8), transparent: true, depthWrite: false }));
        core.position.y = 0.015; root.add(core); scene.add(root);
        return { root, material, core, age: 10 };
    });
    const muzzleLight = new THREE.PointLight(0xffbd75, 0, 2.4, 2), impactLight = new THREE.PointLight(0xffab5b, 0, 2, 2);
    scene.add(muzzleLight, impactLight);
    let impactLightAge = 10, impactIsBlast = false;

    const markGeometry = new THREE.CircleGeometry(0.095, 16);
    const marks = Array.from({ length: 48 }, () => {
        const material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
            uniforms: { markOpacity: { value: 0 } }, vertexShader: `varying vec2 scarUv;void main(){scarUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
            fragmentShader: `varying vec2 scarUv;uniform float markOpacity;
                void main(){vec2 p=scarUv*2.0-1.0;float r=length(p);float ash=1.0-smoothstep(0.35,1.0,r);
                    float grain=0.7+0.3*sin(p.x*39.0)*sin(p.y*41.0);gl_FragColor=vec4(vec3(0.012,0.009,0.006),ash*grain*markOpacity);}`
        });
        const mesh = new THREE.Mesh(markGeometry, material); mesh.visible = false; scene.add(mesh);
        return { mesh, material, age: 100 };
    });
    const casingGeometry = new THREE.CylinderGeometry(0.023, 0.023, 0.082, 8), casingMaterial = new THREE.MeshStandardMaterial({ color: 0xb89042, metalness: 0.8, roughness: 0.30 });
    const casings = Array.from({ length: 12 }, () => {
        const mesh = new THREE.Mesh(casingGeometry, casingMaterial); mesh.visible = false; mesh.castShadow = true; scene.add(mesh);
        return { mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), age: 10, bounced: false };
    });

    const emit = (origin: CombatPoint, velocity: THREE.Vector3, kind: number, size: number, life: number, color: THREE.Color): void => {
        const particle = particles[particleCursor++ % PARTICLES]!;
        particle.active = true; particle.position.set(origin.x, origin.y, origin.z); particle.velocity.copy(velocity);
        particle.age = 0; particle.life = life; particle.size = size; particle.kind = kind; particle.color.copy(color);
        kinds[(particleCursor - 1) % PARTICLES] = kind;
    };
    const randomDirection = (): THREE.Vector3 => new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    const smokeColor = new THREE.Color(0.30, 0.33, 0.34), dustColor = new THREE.Color(0.27, 0.20, 0.13), sparkColor = new THREE.Color(3.4, 1.25, 0.18);
    const cyanSpark = new THREE.Color(0.25, 2.5, 3.8), shellColor = new THREE.Color();
    const emitImpactDust = (origin: THREE.Vector3, blast: number, metal: boolean) => {
        for (let i = 0; i < (blast ? 40 : metal ? 8 : 24); i++) {
            const velocity = randomDirection(); if (velocity.dot(normal) < 0) velocity.negate();
            velocity.multiplyScalar(0.35 + Math.random() * 0.75).addScaledVector(normal, 0.2);
            emit(origin, velocity, metal ? 0 : 2, (blast ? 3 : 1) * (.09 + Math.random() * .12), (blast ? 2 : 1) * (.45 + Math.random() * .55), metal ? smokeColor : dustColor);
        }
    };
    const emitImpactParticles = (hit: ShellHit, origin: THREE.Vector3, blast: number, metal: boolean) => {
        for (let i = 0; i < (blast ? 72 : metal ? 18 : 8); i++) {
            const velocity = randomDirection(); if (velocity.dot(normal) < 0) velocity.negate();
            velocity.multiplyScalar((blast ? 2 : 1) * (0.8 + Math.random() * 2.2)).addScaledVector(normal, 0.6);
            emit(origin, velocity, 1, blast ? .055 : .027, (blast ? 1.2 : 1) * (.22 + Math.random() * .40), hit.weapon === "laser" ? cyanSpark : sparkColor);
        }
        emitImpactDust(origin, blast, metal);
    };
    const impact = (hit: ShellHit): void => {
        impactCount++; if (hit.surface === "metal") metalImpacts++; if (hit.surface === "rock") rockImpacts++;
        normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        const origin = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z).addScaledVector(normal, 0.012);
        const blast = hit.blastScale ?? 0;
        if (blast) destruction.burst(origin, blast);
        const metal = hit.surface === "metal" || hit.surface === "tank";
        if (hit.surface === "tank") tankHits++;
        emitImpactParticles(hit, origin, blast, metal);
        if (hit.surface !== "tank") {
            const mark = marks[markCursor++ % marks.length]!; mark.age = 0; mark.mesh.visible = true;
            mark.mesh.position.copy(origin); mark.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            mark.mesh.scale.setScalar(blast ? blast * 5 : metal ? .8 : 1.2);
        }
        impactLightAge = 0; impactIsBlast = blast > 0; impactLight.position.copy(origin); impactLight.color.set(hit.weapon === "laser" ? 0x65ddff : 0xffab5b);
        const distance = Math.hypot(origin.x - tank.position.x, origin.z - tank.position.z);
        if (blast) audio.explosion(distance, THREE.MathUtils.clamp((origin.x - tank.position.x) / 12, -0.8, 0.8));
        else audio.impact(metal, distance, THREE.MathUtils.clamp((origin.x - tank.position.x) / 12, -0.8, 0.8));
    };

    const showShots = (shots: CannonShot[]) => {
        for (const shot of shots) {
            if (shot.owner === "player") { shotsFired++; recoilAge = 0; } else turretShots++;
            muzzleLightAge = 0;
            const flash = flashes[flashCursor++ % flashes.length]!; flash.age = 0; flash.root.visible = true;
            const laser = shot.weapon === "laser";
            flash.material.uniforms.laserFlash!.value = laser ? 1 : 0;
            (flash.core.material as THREE.MeshBasicMaterial).color.copy(laser ? cyanSpark : sparkColor);
            muzzleLight.color.set(laser ? 0x65ddff : 0xffbd75);
            flash.root.position.set(shot.muzzle.x, shot.muzzle.y, shot.muzzle.z);
            direction.set(shot.forward.x, shot.forward.y, shot.forward.z);
            flash.root.quaternion.setFromUnitVectors(up, direction);
            flash.root.rotateY(Math.random() * Math.PI * 2);
            muzzleLight.position.copy(flash.root.position);
            for (let i = 0; i < (laser ? 3 : 12); i++) {
                const velocity = randomDirection().multiplyScalar(0.24).addScaledVector(direction, 0.25 + Math.random() * 0.5);
                velocity.y += 0.22;
                emit(shot.muzzle, velocity, 0, 0.06 + Math.random() * 0.05, 0.40 + Math.random() * 0.4, smokeColor);
            }
            const casing = casings[(shot.id - 1) % casings.length]!;
            casing.age = laser ? 10 : 0; casing.bounced = false; casing.mesh.visible = !laser;
            casing.mesh.position.set(shot.muzzle.x, shot.muzzle.y - 0.06, shot.muzzle.z).addScaledVector(direction, -0.25).add(new THREE.Vector3(direction.z * 0.15, 0, -direction.x * 0.15));
            casing.velocity.set(direction.z * 1.6, 1.2, -direction.x * 1.6);
            casing.spin.set(7 + Math.random() * 8, 6, 11);
            const distance = Math.hypot(shot.muzzle.x - tank.position.x, shot.muzzle.z - tank.position.z);
            audio.fire(shot.owner === "player" ? 1 : 0.50 / (1 + distance * 0.16), THREE.MathUtils.clamp((shot.muzzle.x - tank.position.x) / 12, -0.8, 0.8), shot.weapon);
        }
    };
    const updateFlashes = (dt: number) => {
        for (const flash of flashes) {
            const life = Math.max(0, 1 - flash.age / 0.095);
            flash.root.visible = life > 0; flash.root.scale.setScalar(0.65 + life * 0.5);
            flash.material.uniforms.flashLife!.value = life * life;
            (flash.core.material as THREE.MeshBasicMaterial).opacity = life;
            flash.age += dt;
        }
        muzzleLight.intensity = 3.8 * Math.exp(-muzzleLightAge * 48);
        impactLight.intensity = (impactIsBlast ? 9 : 1.8) * Math.exp(-impactLightAge * (impactIsBlast ? 7 : 35));
        for (const mark of marks) {
            mark.material.uniforms.markOpacity!.value = Math.max(0, 1 - mark.age / 18) * 0.45;
            mark.mesh.visible = mark.age < 18; mark.age += dt;
        }
    };
    const updateParticles = (dt: number) => {
        for (let i = 0; i < PARTICLES; i++) {
            const p = particles[i]!;
            if (!p.active) { opacities[i] = 0; continue; }
            p.age += dt; const life = p.age / p.life;
            if (life >= 1) { p.active = false; opacities[i] = 0; continue; }
            p.velocity.multiplyScalar(Math.exp(-dt * (p.kind === 1 ? 0.8 : 2.0)));
            p.velocity.y += dt * (p.kind === 0 ? 0.35 : p.kind === 1 ? -4.2 : -0.65);
            p.position.addScaledVector(p.velocity, dt);
            const floor = groundHeight(p.position.x, p.position.z);
            if (p.position.y < floor + 0.015 && p.kind === 1) { p.position.y = floor + 0.015; p.velocity.y = Math.abs(p.velocity.y) * 0.20; }
            p.position.toArray(positions, i * 3); p.color.toArray(colors, i * 3);
            sizes[i] = p.size * (p.kind === 1 ? 1 : 1 + life * 3.0);
            opacities[i] = (p.kind === 1 ? 0.85 : p.kind === 2 ? 0.30 : 0.23) * Math.pow(1 - life, 1.5);
        }
        for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
    };
    const updateShells = (activeShells: ReadonlyArray<import("./demo-combat.js").DemoShell>) => {
        shells.count = Math.min(PROJECTILES, activeShells.length);
        laserTrails.count = 0;
        for (let i = 0; i < shells.count; i++) {
            const shell = activeShells[i]!;
            dummy.position.set(shell.position.x, shell.position.y, shell.position.z);
            direction.set(shell.velocity.x, shell.velocity.y, shell.velocity.z).normalize();
            dummy.quaternion.setFromUnitVectors(up, direction);
            dummy.scale.set(shell.weapon === "laser" ? 0.65 : 1, shell.weapon === "laser" ? 2.6 : shell.weapon === "rocket" ? 1.5 : 1, shell.weapon === "laser" ? 0.65 : 1);
            dummy.updateMatrix(); shells.setMatrixAt(i, dummy.matrix);
            shells.setColorAt(i, shellColor.set(shell.weapon === "laser" ? 0x50f0ff : shell.weapon === "rocket" ? 0xb8c7cb : 0xffffff));
            if (shell.weapon === "laser") {
                const length = Math.min(0.85, shell.age * WEAPON_PROFILES.laser.speed);
                dummy.position.addScaledVector(direction, -length * 0.5); dummy.scale.set(1, length, 1); dummy.updateMatrix();
                laserTrails.setMatrixAt(laserTrails.count++, dummy.matrix);
            } else if (shell.weapon === "rocket") {
                const exhaust = dummy.position.clone().addScaledVector(direction, -0.18);
                emit(exhaust, direction.clone().multiplyScalar(-0.5).add(new THREE.Vector3(0, 0.08, 0)), 0, 0.10, 0.9, smokeColor);
                emit(exhaust, direction.clone().multiplyScalar(-0.7), 1, 0.035, 0.18, sparkColor);
            }
        }
        shells.instanceMatrix.needsUpdate = true;
        if (shells.instanceColor) shells.instanceColor.needsUpdate = true;
        laserTrails.instanceMatrix.needsUpdate = true;
    };
    const updateCasings = (dt: number) => {
        for (const casing of casings) {
            if (casing.age >= 1.6) { casing.mesh.visible = false; continue; }
            casing.age += dt; casing.velocity.y -= dt * 4.5; casing.mesh.position.addScaledVector(casing.velocity, dt);
            casing.mesh.rotation.x += casing.spin.x * dt; casing.mesh.rotation.z += casing.spin.z * dt;
            const floor = groundHeight(casing.mesh.position.x, casing.mesh.position.z);
            if (casing.mesh.position.y < floor + 0.04) {
                if (floor < 0) { casing.age = 10; casing.mesh.visible = false; continue; }
                casing.mesh.position.y = floor + 0.04;
                if (!casing.bounced) { casing.velocity.y = Math.abs(casing.velocity.y) * 0.28; casing.velocity.x *= 0.45; casing.velocity.z *= 0.45; casing.bounced = true; }
                else { casing.velocity.set(0, 0, 0); casing.spin.set(0, 0, 0); }
            }
        }
    };
    return {
        blast: (point: CombatPoint, scale = 3): void => impact({ point, normal: { x: 0, y: 1, z: 0 }, surface: "metal", weapon: "rocket", blastScale: scale }),
        destroy: (root: THREE.Object3D): boolean => { const dx = root.position.x - tank.position.x, dz = root.position.z - tank.position.z; return dx * dx + dz * dz < 35 * 35 && destruction.destroy(root); },
        prepareDestruction: destruction.prepare,
        get destructionStats() { return destruction.stats; },
        launch: (muzzle: CombatPoint, forward: CombatPoint): void => { pendingShots.push(combat.launch(muzzle, forward)); },
        update: (dt: number, firing: boolean, heading32: number, weapon: DemoWeapon = "cannon", external?: NetworkCombatFrame) => {
            recoilAge += dt; impactLightAge += dt; muzzleLightAge += dt;
            const kick = Math.exp(-recoilAge * 15) * (1 + recoilAge * 15);
            for (const { part, rest } of guns) { part.position.copy(rest); part.position.z += kick * 0.065; }
            tank.rotation.order = "YXZ"; tank.rotation.x = kick * 0.018;
            direction.set(Math.sin(heading32 * Math.PI / 16), 0, -Math.cos(heading32 * Math.PI / 16));
            tank.position.addScaledVector(direction, -kick * 0.025);
            tank.updateWorldMatrix(true, true);
            if (socket) socket.getWorldPosition(muzzle);
            else muzzle.copy(tank.position).addScaledVector(direction, TANK_MUZZLE_DISTANCE).add(new THREE.Vector3(0, TANK_MUZZLE_HEIGHT, 0));
            const now = performance.now() / 1000;
            const events = external ?? combat.step(now - lastSimulationTime, firing, muzzle, heading32, now, weapon);
            const activeShells = external?.shells ?? combat.shells;
            lastSimulationTime = now;
            showShots([...events.shots, ...pendingShots.splice(0)]);
            for (const hit of events.impacts) impact(hit);
            destruction.update(dt);
            updateFlashes(dt);
            updateParticles(dt);
            updateShells(activeShells);
            updateCasings(dt);
            return {
                shotsFired, turretShots, tankHits, impacts: impactCount, metalImpacts, rockImpacts, projectiles: activeShells.length,
                projectileTravel: Math.max(0, ...activeShells.filter(shell => shell.owner === "player").map(shell => shell.age * WEAPON_PROFILES[shell.weapon].speed))
            };
        },
        dispose: (): void => { audio.dispose(); destruction.dispose(); }
    };
};

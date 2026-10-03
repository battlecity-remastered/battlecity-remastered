import * as THREE from "three";
import { accelerateCollisionMesh } from "./collision-acceleration.js";
import type { CombatPoint, ShellHit, ShellSweep } from "./demo-combat.js";

type Collider = { root?: THREE.Object3D; meshes: THREE.Mesh[]; bounds: THREE.Box3; surface: "metal" | "rock" | "tank" };
const BUCKET_SIZE = 8;

export const createProjectileCollider = (groundHeight?: (x: number, z: number) => number) => {
    const buckets = new Map<string, Set<Collider>>();
    const raycaster = new THREE.Raycaster(), start = new THREE.Vector3(), end = new THREE.Vector3(), direction = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3(), matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
    raycaster.firstHitOnly = true;
    let target: Collider | undefined;
    let cacheTarget = false, targetPrepared = false;
    const candidates = new Set<Collider>(), intersections: THREE.Intersection[] = [];
    const collectCandidates = (from: CombatPoint, to: CombatPoint, owner: import("./demo-combat.js").ShellOwner | undefined): Set<Collider> => {
        candidates.clear();
        if (owner === "turret" && target) {
            if (!cacheTarget || !targetPrepared) {
                target.root!.updateWorldMatrix(true, true);
                target.bounds.setFromObject(target.root!);
                targetPrepared = true;
            }
            candidates.add(target);
        }
        for (let x = Math.floor(Math.min(from.x, to.x) / BUCKET_SIZE); x <= Math.floor(Math.max(from.x, to.x) / BUCKET_SIZE); x++)
            for (let z = Math.floor(Math.min(from.z, to.z) / BUCKET_SIZE); z <= Math.floor(Math.max(from.z, to.z) / BUCKET_SIZE); z++)
                for (const collider of buckets.get(`${x},${z}`) ?? []) candidates.add(collider);
        return candidates;
    };
    return {
        setTarget: (root: THREE.Object3D): void => {
            const meshes: THREE.Mesh[] = [];
            root.traverse(child => { if (child instanceof THREE.Mesh) { accelerateCollisionMesh(child); meshes.push(child); } });
            target = { root, meshes, bounds: new THREE.Box3(), surface: "tank" };
            targetPrepared = false;
        },
        // Tank transforms are finalized before combat. All shell substeps in a
        // frame can share the same broad-phase bounds; raycasts still use meshes.
        beginFrame: (): void => { cacheTarget = true; targetPrepared = false; },
        register: (root: THREE.Object3D, surface: Collider["surface"]): void => {
            const meshes: THREE.Mesh[] = [];
            root.updateWorldMatrix(true, true);
            root.traverse(child => { if (child instanceof THREE.Mesh && child.visible) { accelerateCollisionMesh(child); meshes.push(child); } });
            if (!meshes.length) return;
            const bounds = new THREE.Box3().setFromObject(root).expandByScalar(0.12);
            const collider = { root, meshes, bounds, surface };
            for (let x = Math.floor(bounds.min.x / BUCKET_SIZE); x <= Math.floor(bounds.max.x / BUCKET_SIZE); x++)
                for (let z = Math.floor(bounds.min.z / BUCKET_SIZE); z <= Math.floor(bounds.max.z / BUCKET_SIZE); z++) {
                    const key = `${x},${z}`, bucket = buckets.get(key) ?? new Set<Collider>();
                    bucket.add(collider); buckets.set(key, bucket);
                }
        },
        unregister: (root: THREE.Object3D): void => { for (const [key, bucket] of buckets) { for (const collider of bucket) if (collider.root === root) bucket.delete(collider); if (bucket.size === 0) buckets.delete(key); } },
        sweep: ((from: CombatPoint, to: CombatPoint, owner): ShellHit | undefined => {
            start.set(from.x, from.y, from.z); end.set(to.x, to.y, to.z);
            direction.subVectors(end, start);
            const length = direction.length();
            if (length < 1e-8) return;
            direction.divideScalar(length);
            raycaster.set(start, direction); raycaster.near = 0; raycaster.far = length;
            const candidates = collectCandidates(from, to, owner);
            let nearest = length + 1, result: ShellHit | undefined;
            for (const collider of candidates) {
                if (collider.root && !collider.root.visible) continue;
                if (!raycaster.ray.intersectsBox(collider.bounds)) continue;
                raycaster.far = Math.min(length, nearest);
                intersections.length = 0;
                const hit = raycaster.intersectObjects(collider.meshes, false, intersections)[0];
                if (!hit || hit.distance >= nearest) continue;
                nearest = hit.distance;
                matrix.copy(hit.object.matrixWorld);
                if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
                    hit.object.getMatrixAt(hit.instanceId, instance); matrix.multiply(instance);
                }
                const normal = (hit.face?.normal.clone() ?? direction.clone().negate()).applyNormalMatrix(normalMatrix.getNormalMatrix(matrix));
                if (normal.dot(direction) > 0) normal.negate();
                result = { point: { x: hit.point.x, y: hit.point.y, z: hit.point.z }, normal: { x: normal.x, y: normal.y, z: normal.z }, surface: collider.surface };
            }
            if (groundHeight) {
                const height = groundHeight(to.x, to.z);
                if (to.y <= height) {
                    const fraction = Math.max(0, Math.min(1, (from.y - height) / Math.max(1e-8, from.y - to.y)));
                    const distance = length * fraction;
                    if (distance < nearest) result = { point: { x: from.x + (to.x - from.x) * fraction, y: height, z: from.z + (to.z - from.z) * fraction }, normal: { x: 0, y: 1, z: 0 }, surface: "ground" };
                }
            }
            return result;
        }) satisfies ShellSweep
    };
};

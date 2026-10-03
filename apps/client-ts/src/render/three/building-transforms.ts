import * as THREE from "three";

const frozen = new WeakMap<THREE.Object3D, Array<{ object: THREE.Object3D; automatic: boolean }>>();

// Blender marks transform animation targets, including their parent assemblies.
// Descendants of those targets must remain live; shader-only animation does not
// need a new local matrix. Restore ordinary behaviour before destruction/reuse.
export const freezeBuildingTransforms = (root: THREE.Object3D): void => {
    if (frozen.has(root)) return;
    const entries: Array<{ object: THREE.Object3D; automatic: boolean }> = [];
    const visit = (object: THREE.Object3D, animated: boolean): void => {
        animated ||= Boolean(object.userData.animated);
        if (!animated) { entries.push({ object, automatic: object.matrixAutoUpdate }); object.updateMatrix(); object.matrixAutoUpdate = false; }
        for (const child of object.children) visit(child, animated);
    };
    visit(root, false); root.updateWorldMatrix(true, true); frozen.set(root, entries);
};

export const thawBuildingTransforms = (root: THREE.Object3D): void => {
    for (const entry of frozen.get(root) ?? []) entry.object.matrixAutoUpdate = entry.automatic;
    frozen.delete(root);
};

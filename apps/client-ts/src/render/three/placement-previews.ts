import * as THREE from "three";

export const createPlacementPreviews = (scene: THREE.Scene) => {
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(3, 0.025, 3), new THREE.MeshBasicMaterial({ color: 0x75efb0, transparent: true, opacity: 0.23, depthWrite: false }));
    ghost.visible = false; scene.add(ghost);
    const corners: number[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        corners.push(sx * .46, 0, sz * .46, sx * .29, 0, sz * .46, sx * .46, 0, sz * .46, sx * .46, 0, sz * .29);
    }
    const dropReticle = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(corners, 3)), new THREE.LineBasicMaterial({ color: 0x83dfbc, transparent: true, opacity: .62, depthWrite: false }));
    dropReticle.visible = false; scene.add(dropReticle);
    return { ghost, dropReticle };
};

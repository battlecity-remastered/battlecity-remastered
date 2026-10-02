import * as THREE from "three";
import type { ClientState } from "../../app/state.js";

export const isMayorTank=(state:ClientState,id:string|null):boolean=>Boolean(id&&(state.remotePlayers.get(id)?.botRole==="mayor" || state.lobby.assignments.some(city=>city.mayorId===id)));
export const createRoleTank=(recruit:THREE.Object3D,mayor:THREE.Object3D):THREE.Group=>{
    const root=new THREE.Group();const ordinary=recruit.clone(true),command=mayor.clone(true);
    ordinary.userData.tankRole="recruit";command.userData.tankRole="mayor";command.visible=false;root.add(ordinary,command);return root;
};
export const updateTankRole=(root:THREE.Object3D,mayor:boolean):void=>{
    for(const child of root.children)if(child.userData.tankRole)child.visible=child.userData.tankRole===(mayor?"mayor":"recruit");
    root.userData.tankRole=mayor?"mayor":"recruit";
};

const finishArmour = (material: THREE.MeshStandardMaterial, enemy: boolean, leader: boolean): void => {
    const original = material.userData.tankOriginalFinish ?? {
        color: material.color.toArray(), metalness: material.metalness,
        roughness: material.roughness, envMapIntensity: material.envMapIntensity
    };
    material.userData.tankOriginalFinish = original;
    const polished = /cyan|dome/.test(material.name);
    if (leader) {
        material.color.setHex(polished ? 0xf2cb70 : 0xb98932);
        material.metalness = 0.86;
        material.roughness = polished ? 0.25 : 0.34;
        material.envMapIntensity = 1.35;
    } else {
        material.color.fromArray(original.color);
        material.metalness = original.metalness;
        material.roughness = original.roughness;
        material.envMapIntensity = original.envMapIntensity;
        if (enemy) material.color.setHex(/dome/.test(material.name) ? 0xaa573a : 0x76332a);
    }
};

const finishOptics = (material: THREE.MeshStandardMaterial, enemy: boolean, leader: boolean): void => {
    const original = material.userData.tankOriginalOptics ?? { color: material.color.toArray(), emissive: material.emissive.toArray() };
    material.userData.tankOriginalOptics = original;
    material.color.fromArray(original.color); material.emissive.fromArray(original.emissive);
    if (leader && enemy) { material.color.setHex(0xff563e); material.emissive.setRGB(0.65, 0.015, 0.005); }
};

// Cloak owns each tank's materials. Gold reuses the worn metal shader and geometry;
// cyan friendly/red enemy optics retain a team cue on the champion's golden hull.
export const updateTankTeam = (root: THREE.Object3D, enemy: boolean, leader = false): void => {
    if (root.userData.enemyTeam === enemy && root.userData.isScoreLeader === leader) return;
    root.userData.enemyTeam = enemy; root.userData.isScoreLeader = leader;
    root.traverse(part => {
        if (!(part instanceof THREE.Mesh)) return;
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (/DX .*armour|Mayor .*armour|Mayor .*dome/.test(material.name)) finishArmour(material, enemy, leader);
            if (material.name === "Command glow") finishOptics(material, enemy, leader);
        }
    });
};

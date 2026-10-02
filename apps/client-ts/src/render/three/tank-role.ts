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

// The DX sheet uses teal friendly tanks and warm red enemy variants. Materials
// are already owned per tank by its cloak controller, so team tint stays local.
export const updateTankTeam=(root:THREE.Object3D,enemy:boolean):void=>{
    if(root.userData.enemyTeam===enemy)return;root.userData.enemyTeam=enemy;
    root.traverse(part=>{if(!(part instanceof THREE.Mesh))return;const materials=Array.isArray(part.material)?part.material:[part.material];for(const material of materials){if(!(material instanceof THREE.MeshStandardMaterial)||!/DX .*armour|Mayor .*armour|Mayor .*dome/.test(material.name))continue;const original=material.userData.teamOriginalColor??material.color.toArray();material.userData.teamOriginalColor=original;if(enemy)material.color.setHex(/dome/.test(material.name)?0xaa573a:0x76332a);else material.color.fromArray(original);}});
};

import * as THREE from "three";
import { trackAngle } from "./turret-tracking.js";

// Only the presentation unfolds. The server's one-tile collider is active as
// soon as deployment succeeds, independent of frame rate or animation progress.
export const createDeployedDefense = (type:number, turret:THREE.Object3D, item:THREE.Object3D|undefined, unfold=true) => {
    const root=new THREE.Group();root.userData.defenseType=type;
    const body=type===8?(item?.clone(true)??new THREE.Group()):turret.clone(true);
    root.add(body);
    let head:THREE.Object3D|undefined,gun:THREE.Object3D|undefined;
    body.traverse(part=>{if(part.userData.role==="defense-head")head=part;if(part.userData.role==="defense-gun")gun=part;});
    // Sleeper and plasma retain their DX product silhouettes on the full-height
    // hydraulic tower, rather than borrowing the standard cannon receiver.
    if(type>=10 && head && item){for(const child of head.children)child.visible=false;const receiver=item.clone(true);receiver.position.y=-.11;head.add(receiver);gun=undefined;}
    const rest=gun?.position.clone(), scale=body.scale.clone();
    const owned:THREE.MeshStandardMaterial[]=[];
    body.traverse(part=>{if(part instanceof THREE.Mesh){const convert=(material:THREE.Material)=>{if(!(material instanceof THREE.MeshStandardMaterial)||material.emissive.getHex()===0)return material;const clone=material.clone();clone.onBeforeCompile=material.onBeforeCompile;clone.customProgramCacheKey=material.customProgramCacheKey;clone.userData.activationIntensity=material.emissiveIntensity;owned.push(clone);return clone;};part.material=Array.isArray(part.material)?part.material.map(convert):convert(part.material);}});
    let elapsed=unfold?0:2, recoil=0;
    const update=(dt:number,orientation?:number,fired=false)=>{
        elapsed+=Math.max(0,dt);const t=THREE.MathUtils.clamp(elapsed/1.35,0,1),lift=t*t*(3-2*t);
        body.scale.set(scale.x*(.62+.38*lift),scale.y*(.075+.925*lift),scale.z*(.62+.38*lift));
        if(head){if(orientation!==undefined)head.rotation.y=trackAngle(head.rotation.y,-orientation*Math.PI/16,dt);head.scale.setScalar(.18+.82*THREE.MathUtils.smoothstep(t,.32,1));}
        if(fired)recoil=.07;recoil*=Math.exp(-dt*18);if(gun&&rest){gun.position.copy(rest);gun.position.z+=recoil;}
        for(const material of owned)material.emissiveIntensity=Number(material.userData.activationIntensity)*THREE.MathUtils.smoothstep(t,.55,1)*(1+.12*Math.sin(elapsed*4));
        root.userData.deploymentProgress=t;
    };
    update(0);
    return {root,update,reveal:()=>{elapsed=0;update(0);},dispose:()=>owned.forEach(material=>material.dispose())};
};

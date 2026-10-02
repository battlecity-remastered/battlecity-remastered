import * as THREE from "three";
import { LEGACY_BOMB_FUSE_MS } from "@battlecity/sim-core";

// Only placed charges glow; cloned materials leave factory specimens unarmed.
export const createBombFuse = (model:THREE.Object3D) => {
    const lamps:Array<{mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];material:THREE.MeshStandardMaterial}>=[];
    model.traverse(part=>{if(part instanceof THREE.Mesh && /bomb.*armed.*lamp/i.test(part.name)){
        const original=part.material,source=Array.isArray(original)?original[0]:original;
        if(source instanceof THREE.MeshStandardMaterial){const material=source.clone();part.material=material;lamps.push({mesh:part,original,material});}
    }});
    const material=new THREE.MeshBasicMaterial({color:0xff4b22,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const ring=new THREE.Mesh(new THREE.RingGeometry(.35,.375,48),material);ring.rotation.x=-Math.PI/2;ring.position.y=.012;ring.visible=false;model.add(ring);
    return {
        update(now:number,endsAt?:number):void {
            ring.visible=endsAt!==undefined;
            const remaining=endsAt===undefined?1:THREE.MathUtils.clamp((endsAt-now)/LEGACY_BOMB_FUSE_MS,0,1);
            const pulse=endsAt===undefined?0:Math.pow(.5+.5*Math.sin(now/1000*(8+(1-remaining)*28)),4);
            material.opacity=.16+pulse*.7;ring.geometry.setDrawRange(0,Math.max(6,Math.ceil(48*remaining)*6));
            for(const lamp of lamps){lamp.material.emissive.setHex(0xff2606);lamp.material.emissiveIntensity=endsAt===undefined?.12:.8+pulse*5;}
        },
        dispose():void {ring.removeFromParent();ring.geometry.dispose();material.dispose();for(const lamp of lamps){lamp.mesh.material=lamp.original;lamp.material.dispose();}}
    };
};

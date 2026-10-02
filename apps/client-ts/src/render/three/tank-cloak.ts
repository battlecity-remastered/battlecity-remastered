import * as THREE from "three";

// Each tank owns its cloak materials, so one pilot cannot fade every tank.
export const createTankCloak=(root:THREE.Object3D)=>{
    const materials:Array<{material:THREE.Material;opacity:number;transparent:boolean;depthWrite:boolean}>=[];
    root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const clone=(source:THREE.Material):THREE.Material=>{const material=source.clone();material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;materials.push({material,opacity:source.opacity,transparent:source.transparent,depthWrite:source.depthWrite});return material;};object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);});
    let previous=false;
    return {update(active:boolean):void{if(active===previous)return;previous=active;for(const entry of materials){entry.material.opacity=active?0.24:entry.opacity;entry.material.transparent=active||entry.transparent;entry.material.depthWrite=active?false:entry.depthWrite;entry.material.needsUpdate=true;}},dispose():void{for(const {material} of materials)material.dispose();}};
};

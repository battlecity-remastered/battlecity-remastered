import * as THREE from "three";
import type { ClientState } from "../../app/state.js";

type Building=ClientState["buildings"] extends Map<string,infer B>?B:never;
export const resolvePopulationDisplay=(state:ClientState,building:Building)=>{
    const capacity=building.type===300?100:50;
    const home=building.attachedHouseId?state.buildings.get(building.attachedHouseId):undefined;
    const validHome=home?.type===300&&home.cityId===building.cityId?home:undefined;
    const occupied=Math.max(0,Math.min(capacity,building.population));
    return {capacity,occupied,lit:Math.ceil(occupied/capacity*6),home:validHome,ready:occupied===capacity,label:building.type===300?`${occupied}/100`:!validHome&&occupied===0?"NO HOME":`${occupied}/50`};
};

// Population is a recessed architectural display, not a token on the apron.
// The crew symbols, occupancy and glass stay inside the building footprint.
export const createPopulationDisplay=(scene:THREE.Scene)=>{
    const limit=64;
    const panelGeometry=new THREE.PlaneGeometry(1,.25);
    const frames=new THREE.InstancedMesh(new THREE.BoxGeometry(1.075,.31,.04),new THREE.MeshStandardMaterial({color:0x273b40,roughness:.53,metalness:.65}),limit);
    frames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);frames.frustumCulled=false;scene.add(frames);frames.count=0;
    const panels=new Map<string,{mesh:THREE.Mesh;canvas:HTMLCanvasElement;texture:THREE.CanvasTexture;signature:string}>();
    const linkGeometry=new THREE.BufferGeometry(),linkPositions=new Float32Array(limit*18);linkGeometry.setAttribute("position",new THREE.BufferAttribute(linkPositions,3).setUsage(THREE.DynamicDrawUsage));
    const links=new THREE.LineSegments(linkGeometry,new THREE.LineBasicMaterial({color:0x62b4bd,transparent:true,opacity:.25,depthWrite:false,depthTest:false}));links.frustumCulled=false;links.renderOrder=10;scene.add(links);
    const commuters=new THREE.InstancedMesh(new THREE.SphereGeometry(.018,8,6),new THREE.MeshBasicMaterial({color:0x8ad4d8,depthTest:false,depthWrite:false}),limit*3);commuters.frustumCulled=false;scene.add(commuters);commuters.count=0;
    const dummy=new THREE.Object3D(),normal=new THREE.Vector3(0,0,1);let last=-Infinity;
    const release=(entry:typeof panels extends Map<string,infer V>?V:never)=>{entry.mesh.removeFromParent();entry.texture.dispose();(entry.mesh.material as THREE.Material).dispose();};
    return {update(state:ClientState,seconds:number):void{
        if(seconds-last<.10)return;last=seconds;
        if(state.ui.selectedPopulationHouseId&&!state.buildings.has(state.ui.selectedPopulationHouseId))state.ui.selectedPopulationHouseId=null;
        const selectedHouse=state.ui.selectedPopulationHouseId;
        (links.material as THREE.LineBasicMaterial).opacity=selectedHouse?.58:.30;
        const showLinks=Boolean(selectedHouse)||state.ui.showPopulationLinks||state.ui.showBuildMenu||state.ui.buildGhostMode;
        const x=(state.local.x+24)/48,z=(state.local.y+24)/48;
        const buildings=[...state.buildings.values()].filter(building=>{if(building.cityId!==state.local.city)return false;const dx=building.tileX+1.5-x,dz=building.tileY+1.5-z;return dx*dx+dz*dz<24*24;}).slice(0,limit);
        const retained=new Set<string>(),segments:number[]=[];let actor=0;
        buildings.forEach((building,index)=>{
            retained.add(building.id);const population=resolvePopulationDisplay(state,building);
            let px=building.tileX-254.5,pz=building.tileY-256+2.075,py=.42,width=1;
            if(building.type===300){pz=building.tileY-256+2.82;py=.57;}
            else if(building.type>=400){px-=.67;pz=building.tileY-256+2.38;py=.58;}
            else if(building.type===0){px+=.94;pz=building.tileY-256+1.70;py=.61;width=.74;}
            else if(building.type===200){px+=.83;py=.62;width=.8;}
            let entry=panels.get(building.id);
            if(!entry){const canvas=document.createElement("canvas");canvas.width=320;canvas.height=80;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.28,metalness:.28,roughness:.36});const mesh=new THREE.Mesh(panelGeometry,material);scene.add(mesh);entry={mesh,canvas,texture,signature:""};panels.set(building.id,entry);}
            entry.mesh.position.set(px,py,pz);entry.mesh.rotation.x=-Math.PI/3;entry.mesh.scale.set(width,1,1);
            dummy.position.copy(entry.mesh.position);dummy.quaternion.copy(entry.mesh.quaternion);dummy.scale.copy(entry.mesh.scale);dummy.position.addScaledVector(normal.clone().applyQuaternion(dummy.quaternion),-.024);dummy.updateMatrix();frames.setMatrixAt(index,dummy.matrix);
            const selected=selectedHouse===building.id||selectedHouse===population.home?.id;
            const signature=`${selected}:${population.occupied}:${population.capacity}:${population.lit}:${population.ready}`;
            if(entry.signature!==signature){entry.signature=signature;const c=entry.canvas.getContext("2d")!;c.clearRect(0,0,320,80);const background=c.createLinearGradient(0,0,320,80);background.addColorStop(0,"#0b2229");background.addColorStop(.55,"#07141b");background.addColorStop(1,"#122c31");c.fillStyle=background;c.fillRect(0,0,320,80);c.strokeStyle=selected?"#73aeb7":"#31585e";c.lineWidth=2;c.strokeRect(3,3,314,74);
                c.font="12px monospace";c.textAlign="left";c.fillStyle="#678a8c";c.fillText(building.type===300?"RESIDENTS":"CREW",12,18);
                for(let slot=0;slot<6;slot++){const active=slot<population.lit,cx=20+slot*26;c.fillStyle=active?"#9bbeb9":"#29464b";c.fillRect(cx-5,37,10,17);c.fillRect(cx-10,38,4,11);c.fillRect(cx+6,38,4,11);c.fillRect(cx-5,55,4,10);c.fillRect(cx+1,55,4,10);c.fillStyle=active?"#c07359":"#3c4d4c";c.beginPath();c.arc(cx,29,5,0,Math.PI*2);c.fill();}
                c.font="bold 34px monospace";c.textAlign="right";c.fillStyle=population.ready?"#aacbc0":"#94aeb0";c.fillText(`${population.occupied}/${population.capacity}`,305,55);
                c.fillStyle="#1d3a40";c.fillRect(177,63,128,3);c.fillStyle=population.ready?"#579e89":"#9a8154";c.fillRect(177,63,128*population.occupied/population.capacity,3);
                c.fillStyle="#9cc4cb08";c.beginPath();c.moveTo(0,0);c.lineTo(140,0);c.lineTo(90,80);c.lineTo(0,80);c.fill();entry.texture.needsUpdate=true;
            }
            if(showLinks&&population.home&&(!selectedHouse||population.home.id===selectedHouse)){const home=population.home,hx=home.tileX-254.5,hz=home.tileY-256+2.82,tx=px,tz=pz,bend=(hx+tx)/2;segments.push(hx,.035,hz,bend,.035,hz,bend,.035,hz,bend,.035,tz,bend,.035,tz,tx,.035,tz);
                for(let dot=0;dot<3&&actor<limit*3;dot++){const t=(seconds*.15+dot/3)%1,first=Math.abs(bend-hx),middle=Math.abs(tz-hz),total=first+middle+Math.abs(tx-bend),distance=t*total;if(distance<first)dummy.position.set(THREE.MathUtils.lerp(hx,bend,distance/(first||1)),.11,hz);else if(distance<first+middle)dummy.position.set(bend,.11,THREE.MathUtils.lerp(hz,tz,(distance-first)/(middle||1)));else dummy.position.set(THREE.MathUtils.lerp(bend,tx,(distance-first-middle)/(Math.abs(tx-bend)||1)),.11,tz);dummy.quaternion.identity();dummy.scale.setScalar(1);dummy.updateMatrix();commuters.setMatrixAt(actor++,dummy.matrix);}}
        });
        for(const [id,entry] of panels)if(!retained.has(id)){release(entry);panels.delete(id);}
        frames.count=buildings.length;frames.instanceMatrix.needsUpdate=true;
        linkPositions.fill(0);linkPositions.set(segments);linkGeometry.attributes.position!.needsUpdate=true;linkGeometry.setDrawRange(0,segments.length/3);links.visible=showLinks;commuters.count=actor;commuters.instanceMatrix.needsUpdate=true;
    },dispose():void{for(const entry of panels.values())release(entry);panels.clear();panelGeometry.dispose();for(const mesh of [frames,commuters]){mesh.removeFromParent();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}links.removeFromParent();linkGeometry.dispose();(links.material as THREE.Material).dispose();}};
};

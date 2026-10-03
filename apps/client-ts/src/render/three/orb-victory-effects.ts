import * as THREE from "three";
import type { ClientState } from "../../app/state.js";
import { resolveCitySpawn } from "../../world/city-spawn.js";

// Four reusable collapse rigs bound GPU resources even during a busy match.
export const createOrbVictoryEffects=(scene:THREE.Scene)=>{
    const sphere=new THREE.SphereGeometry(1,32,20),ring=new THREE.TorusGeometry(1,0.025,8,96);
    const rigs=Array.from({length:4},()=>{
        const root=new THREE.Group();root.visible=false;scene.add(root);
        const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{phase:{value:0}},vertexShader:`varying vec3 p;varying vec3 n;uniform float phase;void main(){p=position;n=normal;vec3 q=position*(1.0+sin(position.y*18.0+phase*30.0)*0.025);gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.0);}`,fragmentShader:`varying vec3 p;varying vec3 n;uniform float phase;void main(){float veins=pow(1.0-abs(sin(p.y*19.0+sin(p.x*11.0+phase*15.0)+p.z*8.0)),12.0);float edge=pow(1.0-abs(n.y),2.0);float fade=pow(1.0-phase,2.0);vec3 energy=mix(vec3(0.45,0.06,1.8),vec3(0.12,1.5,3.5),veins);gl_FragColor=vec4(energy,(0.08+edge*0.3+veins*0.5)*fade);}`});
        const bubble=new THREE.Mesh(sphere,material);bubble.position.y=0.7;root.add(bubble);
        const ringMaterial=new THREE.MeshBasicMaterial({color:0xa489ff,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false});
        const wave=new THREE.Mesh(ring,ringMaterial);wave.rotation.x=-Math.PI/2;wave.position.y=0.045;root.add(wave);
        const light=new THREE.PointLight(0x9373ff,0,16,2);light.position.y=2;root.add(light);
        return{root,bubble,wave,material,ringMaterial,light,age:10};
    });
    let lastEvent="",cursor=0;
    return{update(state:ClientState,dt:number):void{
        const event=state.events.lastOrbEvent,key=event?`${event.at}:${event.targetCityId}:${event.by}`:"";
        if(event && key!==lastEvent){lastEvent=key;const city=resolveCitySpawn(event.targetCityId);if(city){const rig=rigs[cursor++%rigs.length]!;rig.root.position.set(event.position ? event.position.x / 48 - 256 : city.tileX-256+1.5,0,event.position ? event.position.y / 48 - 256 : city.tileY-256+1.5);rig.age=0;rig.root.visible=true;}}
        for(const rig of rigs){rig.age+=dt;const phase=Math.min(1,rig.age/3.2);rig.root.visible=phase<1;if(!rig.root.visible)continue;rig.material.uniforms.phase!.value=phase;rig.bubble.scale.setScalar(0.4+Math.pow(phase,.65)*7);rig.wave.scale.setScalar(0.3+phase*11);rig.ringMaterial.opacity=Math.pow(1-phase,2)*0.8;rig.light.intensity=8*Math.exp(-phase*9);}
    },dispose():void{sphere.dispose();ring.dispose();for(const rig of rigs){rig.material.dispose();rig.ringMaterial.dispose();rig.root.removeFromParent();}}};
};

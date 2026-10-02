import * as THREE from "three";
import type { CombatPoint } from "./demo-combat.js";

const MAX_CLOUDS=256, MAX_DESTRUCTIONS=6, MAX_FRAGMENTS=18;
type Cloud={position:THREE.Vector3;velocity:THREE.Vector3;age:number;life:number;size:number;seed:number;kind:number};
type Fragment={mesh:THREE.Mesh;velocity:THREE.Vector3;spin:THREE.Vector3;scale:THREE.Vector3;landed:boolean};
type Destruction={source:THREE.Object3D;root:THREE.Object3D;age:number;position:THREE.Vector3;scale:THREE.Vector3;rotation:THREE.Quaternion;fragments:Fragment[];materials:THREE.Material[]};

// All debris is presentation only: shared source geometry, owned materials,
// capped clouds and collapse rigs. The authoritative collider is already gone.
export const createDestructionEffects=(scene:THREE.Scene,groundHeight:(x:number,z:number)=>number)=>{
    const clouds:Cloud[]=[],destructions:Destruction[]=[];
    const plane=new THREE.PlaneGeometry(1,1),dummy=new THREE.Object3D();
    const noise=`
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
        float fbm(vec2 p){float a=noise(p)*.57;p=mat2(.8,-.6,.6,.8)*p*2.13;return a+noise(p)*.28+noise(p*2.07)*.15;}
    `;
    const makeClouds=(fire:boolean)=>{
        const ages=new Float32Array(MAX_CLOUDS*4),attribute=new THREE.InstancedBufferAttribute(ages,4).setUsage(THREE.DynamicDrawUsage);
        const geometry=plane.clone();geometry.setAttribute("cloudData",attribute);
        const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.NormalBlending,
            vertexShader:`attribute vec4 cloudData;varying vec2 cloudUv;varying vec4 cloud;
                void main(){cloudUv=uv;cloud=cloudData;vec4 center=modelViewMatrix*instanceMatrix*vec4(0,0,0,1);center.xy+=position.xy*cloudData.w;gl_Position=projectionMatrix*center;}`,
            fragmentShader:`varying vec2 cloudUv;varying vec4 cloud;${noise}
                void main(){vec2 p=cloudUv*2.0-1.0;float life=cloud.x,seed=cloud.y,kind=cloud.z;
                    vec2 swirl=p*3.5+vec2(seed,seed*.7);swirl+=vec2(sin(p.y*3.0+life*5.0),-life*2.2)*.8;
                    float n=fbm(swirl),detail=fbm(swirl*2.1+life);
                    float rim=1.0-smoothstep(.18,.98,length(p)+(.5-n)*.4);
                    float fade=smoothstep(0.0,.08,life)*(1.0-smoothstep(.55,1.0,life));
                    ${fire?`float heat=(1.0-life)*(.14+n*.8)+rim*.12;
                    vec3 color=mix(vec3(.20,.008,.001),vec3(3.2,.32,.012),smoothstep(.16,.67,heat));
                    color=mix(color,vec3(4.5,1.6,.18),smoothstep(.64,.90,heat));
                    color+=vec3(2.0,1.1,.28)*exp(-life*22.0);
                    gl_FragColor=vec4(color,rim*fade*(.42+detail*.48));`:
                    `vec3 soot=mix(vec3(.028,.022,.019),vec3(.27,.22,.16),n*.75+cloudUv.y*.2);
                    float warm=pow(1.0-life,7.0)*max(0.0,1.0-cloudUv.y)*detail;
                    soot+=vec3(1.4,.22,.018)*warm;
                    gl_FragColor=vec4(soot,rim*fade*(kind>1.5?.30:.58)*(.65+detail*.35));`}
                }`});
        const mesh=new THREE.InstancedMesh(geometry,material,MAX_CLOUDS);mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.renderOrder=fire?4:5;mesh.layers.set(1);scene.add(mesh);
        return {mesh,geometry,material,ages,attribute};
    };
    const fire=makeClouds(true),smoke=makeClouds(false);
    const scorchGeometry=new THREE.PlaneGeometry(1,1);
    const scars=Array.from({length:6},()=>{
        const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
            uniforms:{age:{value:100},seed:{value:0}},vertexShader:`varying vec2 scarUv;void main(){scarUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
            fragmentShader:`varying vec2 scarUv;uniform float age;uniform float seed;${noise}
                void main(){vec2 p=scarUv*2.0-1.0;float n=fbm(p*9.0+seed);float edge=1.0-smoothstep(.35,.98,length(p)+(.5-n)*.23);
                    float embers=pow(max(0.0,n-.62)*2.6,3.0)*exp(-age*.65);
                    vec3 color=mix(vec3(.012,.008,.006),vec3(2.7,.20,.009),embers);
                    gl_FragColor=vec4(color,edge*.72*(1.0-smoothstep(10.0,18.0,age)));}`});
        const mesh=new THREE.Mesh(scorchGeometry,material);mesh.rotation.x=-Math.PI/2;mesh.visible=false;mesh.layers.set(1);scene.add(mesh);return{mesh,material,age:100};
    });
    let scarCursor=0,burstCount=0;
    const addCloud=(position:THREE.Vector3,velocity:THREE.Vector3,size:number,life:number,kind:number,age=0)=>{
        if(clouds.length>=MAX_CLOUDS)clouds.shift();clouds.push({position,velocity,size,life,kind,age,seed:Math.random()*99});
    };
    const burst=(point:CombatPoint,scale=3):void=>{
        burstCount++;
        const radius=Math.max(.4,scale*.45),center=new THREE.Vector3(point.x,Math.max(.12,point.y),point.z);
        for(let i=0;i<22;i++){
            const angle=i*2.39996,r=.08+Math.sqrt(i/22)*radius*.48;
            const position=center.clone().add(new THREE.Vector3(Math.cos(angle)*r,(i%4)*.13,Math.sin(angle)*r));
            addCloud(position,new THREE.Vector3(Math.cos(angle)*(.6+i/25),1.1+(i%5)*.18,Math.sin(angle)*(.6+i/25)),.8+radius*.7,1.0+(i%4)*.16,0,-(i%4)*.035);
        }
        for(let i=0;i<24;i++){
            const angle=i*Math.PI*2/24;
            addCloud(center.clone(),new THREE.Vector3(Math.cos(angle)*(1.1+i%3*.3),1.0+i%5*.22,Math.sin(angle)*(1.1+i%3*.3)),.75+radius*.65,3.2+i%5*.35,1,-.5-i%4*.055);
            const ground=new THREE.Vector3(center.x,groundHeight(center.x,center.z)+.07,center.z);
            addCloud(ground,new THREE.Vector3(Math.cos(angle)*4.2,.10,Math.sin(angle)*4.2),.5,1.8+i%3*.18,2);
        }
        const scar=scars[scarCursor++%scars.length]!;scar.age=0;scar.material.uniforms.seed!.value=Math.random()*99;
        scar.mesh.position.set(center.x,groundHeight(center.x,center.z)+.015,center.z);scar.mesh.scale.setScalar(radius*3.1);
    };
    const finish=(entry:Destruction):void=>{
        entry.root.visible=false;entry.root.position.copy(entry.position);entry.root.scale.copy(entry.scale);entry.root.quaternion.copy(entry.rotation);
        entry.root.removeFromParent();
        for(const fragment of entry.fragments)fragment.mesh.removeFromParent();
        for(const material of entry.materials)material.dispose();
    };
    const destroy=(root:THREE.Object3D):boolean=>{
        if(!root.visible||destructions.some(entry=>entry.source===root))return false;
        if(destructions.length>=MAX_DESTRUCTIONS)finish(destructions.shift()!);
        // Preserve the reusable authoritative model (notably command centres).
        // Its visual remnant owns transforms but shares immutable source geometry.
        const original=root;root=original.clone(true);root.userData.destructiveRemnant=true;root.userData.destructiveDefense=Boolean(original.userData.previewDefenseId||original.userData.defenseType);delete root.userData.previewDefenseId;
        delete root.userData.renderTileX;delete root.userData.renderTileY;scene.add(root);
        original.visible=false;if(!original.userData.commandCenter)original.removeFromParent();
        root.updateWorldMatrix(true,true);
        const candidates:Array<{source:THREE.Mesh;volume:number;height:number}>=[],size=new THREE.Vector3(),position=new THREE.Vector3();
        root.traverse(source=>{
            if(!(source instanceof THREE.Mesh)||!source.visible||source.userData.ownedEffect||source instanceof THREE.InstancedMesh)return;
            const material=Array.isArray(source.material)?source.material[0]:source.material;if(!material||material.transparent)return;
            source.geometry.computeBoundingBox();const box=source.geometry.boundingBox;if(!box)return;
            box.getSize(size);source.getWorldScale(position);size.multiply(position);
            const dimension=Math.max(size.x,size.y,size.z);source.getWorldPosition(position);
            if(dimension<.07||dimension>2.8||position.y<.16)return;
            candidates.push({source,volume:size.x*size.y*size.z,height:position.y});
        });
        candidates.sort((a,b)=>b.volume+b.height*.015-a.volume-a.height*.015);
        const materials=new Map<THREE.Material,THREE.Material>(),fragments:Fragment[]=[];
        const cloneMaterial=(source:THREE.Material)=>{let material=materials.get(source);if(!material){material=source.clone();material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;if(material instanceof THREE.MeshStandardMaterial){material.userData.debrisColor=material.color.clone();material.userData.debrisGlow=material.emissiveIntensity;}materials.set(source,material);}return material;};
        for(const {source} of candidates.slice(0,MAX_FRAGMENTS)){
            const mesh=new THREE.Mesh(source.geometry,Array.isArray(source.material)?source.material.map(cloneMaterial):cloneMaterial(source.material));
            source.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);source.visible=false;
            const dx=mesh.position.x-root.position.x,dz=mesh.position.z-root.position.z,angle=Math.atan2(dz,dx);
            fragments.push({mesh,scale:mesh.scale.clone(),velocity:new THREE.Vector3(Math.cos(angle)*(1.0+Math.random()*1.8),2.0+Math.random()*2.2,Math.sin(angle)*(1.0+Math.random()*1.8)),spin:new THREE.Vector3((Math.random()-.5)*5,(Math.random()-.5)*4,(Math.random()-.5)*5),landed:false});
        }
        destructions.push({source:original,root,fragments,materials:[...materials.values()],age:0,position:root.position.clone(),scale:root.scale.clone(),rotation:root.quaternion.clone()});
        burst({x:root.position.x,y:.4,z:root.position.z},root.userData.destructiveDefense?1.5:2.8);
        return true;
    };
    return {burst,destroy,async prepare(renderer:THREE.WebGLRenderer,camera:THREE.Camera):Promise<void>{
        // Compile just the new effects before the first bomb; no world render.
        const warm=new THREE.Scene(),parts=[fire.mesh.clone(),smoke.mesh.clone(),scars[0]!.mesh.clone()];warm.add(...parts);
        await renderer.compileAsync(warm,camera,scene);
        for(const part of parts)if(part instanceof THREE.InstancedMesh)part.dispose();warm.clear();
    },update(dt:number):void{
        for(let i=destructions.length-1;i>=0;i--){
            const entry=destructions[i]!;entry.age+=dt;
            const collapse=THREE.MathUtils.smoothstep(entry.age,.14,1.25);
            entry.root.visible=entry.age<1.35;entry.root.position.y=entry.position.y-collapse*.8;
            entry.root.scale.y=entry.scale.y*(1-collapse*.91);entry.root.rotation.z=Math.sin(collapse*Math.PI)*.11;
            for(const fragment of entry.fragments){
                if(!fragment.landed){fragment.velocity.y-=dt*6.5;fragment.mesh.position.addScaledVector(fragment.velocity,dt);fragment.mesh.rotation.x+=fragment.spin.x*dt;fragment.mesh.rotation.y+=fragment.spin.y*dt;fragment.mesh.rotation.z+=fragment.spin.z*dt;
                    const floor=groundHeight(fragment.mesh.position.x,fragment.mesh.position.z)+.04;
                    if(fragment.mesh.position.y<=floor){fragment.mesh.position.y=floor;if(Math.abs(fragment.velocity.y)>1.0){fragment.velocity.y=Math.abs(fragment.velocity.y)*.23;fragment.velocity.x*=.48;fragment.velocity.z*=.48;fragment.spin.multiplyScalar(.35);}else fragment.landed=true;}
                }
                const bury=THREE.MathUtils.smoothstep(entry.age,5,7);fragment.mesh.scale.copy(fragment.scale).multiplyScalar(1-bury);fragment.mesh.visible=bury<1;
            }
            const char=THREE.MathUtils.smoothstep(entry.age,.4,2.2);
            for(const material of entry.materials)if(material instanceof THREE.MeshStandardMaterial){material.color.copy(material.userData.debrisColor as THREE.Color).multiplyScalar(1-char*.55);material.roughness=Math.max(material.roughness,char*.85);material.emissiveIntensity=Number(material.userData.debrisGlow)*Math.exp(-entry.age*2.2);}
            if(entry.age>=7){finish(entry);destructions.splice(i,1);}
        }
        fire.mesh.count=smoke.mesh.count=0;
        for(let i=clouds.length-1;i>=0;i--){const cloud=clouds[i]!;cloud.age+=dt;if(cloud.age>=cloud.life){clouds.splice(i,1);continue;}if(cloud.age<0)continue;
            const drag=cloud.kind===2?2.1:.65;cloud.velocity.multiplyScalar(Math.exp(-dt*drag));cloud.position.addScaledVector(cloud.velocity,dt);
            if(cloud.kind===1)cloud.velocity.y+=dt*.35;
            const progress=cloud.age/cloud.life,layer=cloud.kind===0?fire:smoke,index=layer.mesh.count++;
            dummy.position.copy(cloud.position);dummy.updateMatrix();layer.mesh.setMatrixAt(index,dummy.matrix);
            layer.ages.set([progress,cloud.seed,cloud.kind,cloud.size*(1+progress*(cloud.kind===0?1.2:2.4))],index*4);
        }
        for(const layer of [fire,smoke]){layer.mesh.visible=layer.mesh.count>0;if(layer.mesh.visible){layer.mesh.instanceMatrix.needsUpdate=true;layer.attribute.needsUpdate=true;}}
        for(const scar of scars){scar.age+=dt;scar.mesh.visible=scar.age<18;scar.material.uniforms.age!.value=scar.age;}
    },get stats(){return{bursts:burstCount,collapsing:destructions.filter(entry=>entry.age<1.35).length,fragments:destructions.reduce((sum,entry)=>sum+entry.fragments.length,0),clouds:clouds.length};},dispose():void{
        for(const entry of destructions)finish(entry);destructions.length=clouds.length=0;
        for(const layer of [fire,smoke]){layer.mesh.removeFromParent();layer.mesh.dispose();layer.geometry.dispose();layer.material.dispose();}
        for(const scar of scars){scar.mesh.removeFromParent();scar.material.dispose();}scorchGeometry.dispose();plane.dispose();
    }};
};

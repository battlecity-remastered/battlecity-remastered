import * as THREE from "three";
import type { ClientState } from "../../app/state.js";
import { createResearchStatus, demoResearchStatus } from "./research-status.js";

// Render the actual item model into the laboratory screen. Two small offscreen
// views share the scene clock, while their glass/scan effects run every frame.
export const createResearchDisplays = (renderer: THREE.WebGLRenderer, environment: THREE.Texture) => {
    const clock = { value: 0 };
    const statusClock = createResearchStatus();
    let showroomStart: number | undefined;
    let statusSignature="[]";
    const displays: Array<{ building: THREE.Object3D; scene: THREE.Scene; camera: THREE.OrthographicCamera; target: THREE.WebGLRenderTarget; turntable: THREE.Group; resources: Array<{dispose():void}>; mode: {value:number}; progress: {value:number}; statusCanvas: HTMLCanvasElement; statusTexture: THREE.CanvasTexture; signature: string; demoCycle: boolean; statusMaterials: THREE.MeshStandardMaterial[] }> = [];

    const savedColor = new THREE.Color();
    const displayBounds=new THREE.Sphere(new THREE.Vector3(),4);
    let lastCapture = -Infinity;

    return {
        register: (building: THREE.Object3D, template: THREE.Object3D, product: string, type: number, demoCycle = false): void => {
            const resources:Array<{dispose():void}>=[];
            const statusMaterials:THREE.MeshStandardMaterial[]=[];
            const materialCopies=new Map<THREE.Material,THREE.MeshStandardMaterial>();
            building.traverse(child => {
                if (child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material.name === "Research display glow") child.visible = false;
                if(!(child instanceof THREE.Mesh) || Array.isArray(child.material) || !(child.material instanceof THREE.MeshStandardMaterial))return;
                const name=child.name.replaceAll("_"," ");
                if(child.material.name!=="Research reactor glow" && child.material.name!=="Command glow" && !/Research crystalline specimen|Faceted specimen tip|Static containment field|Research charged core|Scanner charged tip|Probe charged lens/.test(name))return;
                let material=materialCopies.get(child.material);
                if(!material){material=child.material.clone();material.onBeforeCompile=child.material.onBeforeCompile;material.customProgramCacheKey=child.material.customProgramCacheKey;materialCopies.set(child.material,material);statusMaterials.push(material);resources.push(material);}
                child.material=material;
            });
            const scene = new THREE.Scene();
            scene.environment = environment;
            scene.environmentIntensity = 0.7;
            scene.add(new THREE.HemisphereLight(0xb4f5ff,0x143747,1.2));
            const light = new THREE.DirectionalLight(0xc6f7ff,3.0);
            light.position.set(-2,4,3);
            scene.add(light);
            const item = template.clone(true);
            const bounds = new THREE.Box3().setFromObject(item);
            const center = bounds.getCenter(new THREE.Vector3());
            item.position.sub(center);
            item.traverse(child => {
                if (!(child instanceof THREE.Mesh)) return;
                child.castShadow = child.receiveShadow = false;
                const source = child.material as THREE.MeshStandardMaterial;
                const hologram = new THREE.MeshStandardMaterial({
                    color: source.color.clone().lerp(new THREE.Color(0x52bcca),0.32),
                    metalness: 0.45, roughness: 0.34,
                    emissive: source.color.clone().multiplyScalar(0.12).add(new THREE.Color(0x083b48)),
                    emissiveIntensity: 0.65
                });
                resources.push(hologram);
                child.material = hologram;
                // Fine edge light keeps the weapon recognizable against dark glass.
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry,32),new THREE.LineBasicMaterial({ color: 0x72e8ff, transparent: true, opacity: 0.34 }));
                resources.push(edges.geometry,edges.material as THREE.Material);
                child.add(edges);
            });
            const turntable = new THREE.Group();
            turntable.add(item);
            scene.add(turntable);
            const camera = new THREE.OrthographicCamera(-0.48,0.48,0.48,-0.48,0.1,12);
            camera.position.set(0.6,2.8,2.2);
            camera.lookAt(0,0,0);
            const target = new THREE.WebGLRenderTarget(192,192,{ type: THREE.HalfFloatType, depthBuffer: true });
            const mode = {value:0}, progress = {value:0};
            const statusCanvas = document.createElement("canvas");
            statusCanvas.width=384; statusCanvas.height=48;
            const statusTexture = new THREE.CanvasTexture(statusCanvas);
            statusTexture.colorSpace=THREE.SRGBColorSpace;
            resources.push(statusTexture);
            displays.push({building, scene, camera, target, turntable, resources, mode, progress, statusCanvas, statusTexture, signature:"", demoCycle, statusMaterials });

            const label = document.createElement("canvas");
            label.width = 256; label.height = 36;
            const context = label.getContext("2d")!;
            context.fillStyle = "#060f13";
            context.fillRect(0,0,256,36);
            context.fillStyle = "#9ce7ef";
            context.font = "bold 23px monospace";
            context.textBaseline = "middle";
            context.fillText(product.toUpperCase(),7,19);
            context.textAlign = "right";
            context.fillStyle = "#50818c";
            context.font = "18px monospace";
            context.fillText(String(type),248,19);
            const labelTexture = new THREE.CanvasTexture(label);
            labelTexture.colorSpace = THREE.SRGBColorSpace;
            resources.push(labelTexture);
            const screen = new THREE.ShaderMaterial({
                uniforms: { weaponView: { value: target.texture }, identification: { value: labelTexture }, displayTime: clock, researchMode: mode, researchProgress: progress, statusText: {value:statusTexture} },
                vertexShader: `varying vec2 panelUv; void main(){panelUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                fragmentShader: `
                    uniform sampler2D weaponView; uniform sampler2D identification; uniform sampler2D statusText;
                    uniform float displayTime; uniform float researchMode; uniform float researchProgress;
                    varying vec2 panelUv;
                    void main(){
                        vec2 uv=panelUv;
                        vec2 center=uv-vec2(0.5,0.56);
                        float r=length(center);
                        float grid=pow(max(0.0,cos(uv.x*100.0)*cos(uv.y*100.0)),14.0);
                        vec3 color=vec3(0.004,0.013,0.023)+grid*vec3(0.005,0.025,0.033);
                        vec3 tint=researchMode>1.5?vec3(0.10,0.80,0.60):researchMode>0.5?vec3(0.95,0.38,0.06):vec3(0.08,0.18,0.22);
                        float reticle=exp(-abs(r-0.285)*240.0);
                        float angle=atan(center.y,center.x);
                        float dashes=step(0.15,sin(angle*12.0));
                        float dial=fract((angle+1.5707963)/6.2831853+1.0);
                        color+=tint*reticle*dashes*(0.20+0.80*step(dial,researchProgress));
                        vec2 imageUv=(uv-vec2(0.5,0.56))*1.18+0.5;
                        vec4 weapon=texture2D(weaponView,imageUv);
                        float inside=step(0.0,imageUv.x)*step(imageUv.x,1.0)*step(0.0,imageUv.y)*step(imageUv.y,1.0);
                        float scan=exp(-abs(uv.y-fract(displayTime*0.22))*110.0);
                        float lines=0.89+0.11*sin(uv.y*900.0);
                        float itemStrength=researchMode>1.5?1.15:researchMode>0.5?0.045:0.14;
                        color=mix(color,weapon.rgb*lines*itemStrength,weapon.a*inside);
                        if(researchMode>0.5 && researchMode<1.5){
                            // Contained plasma drains through the neck into a lower vessel.
                            vec2 h=center-vec2(0.0,-0.018);
                            float within=step(abs(h.y),0.185);
                            float width=0.015+abs(h.y)*0.63;
                            float glass=exp(-abs(abs(h.x)-width)*340.0)*within;
                            float caps=exp(-abs(abs(h.y)-0.185)*380.0)*step(abs(h.x),0.145);
                            float top=step(0.018,h.y)*step(h.y,0.018+(1.0-researchProgress)*0.152);
                            float bottom=step(-0.181,h.y)*step(h.y,-0.181+researchProgress*0.155);
                            float vessel=1.0-smoothstep(width-0.012,width,abs(h.x));
                            float grain=0.76+0.24*sin(h.y*420.0-h.x*330.0+displayTime*3.0);
                            float stream=exp(-abs(h.x-sin(h.y*90.0+displayTime*10.0)*0.002)*700.0)*step(-0.16,h.y)*step(h.y,0.022);
                            color+=tint*(glass*0.8+caps*1.6+(top+bottom)*vessel*grain*0.8+stream*0.9);
                            float orbit=exp(-abs(r-0.305)*280.0)*pow(max(0.0,cos(angle-displayTime*2.3)),24.0);
                            color+=tint*orbit*1.6;
                        }
                        if(researchMode>1.5){
                            float pulse=0.75+0.25*sin(displayTime*2.3);
                            color+=tint*reticle*pulse*0.45;
                            vec2 check=uv-vec2(0.80,0.23);
                            float tick=exp(-abs(check.y-mix(-check.x,check.x*0.85,step(0.0,check.x)))*280.0)*step(-0.035,check.x)*step(check.x,0.06);
                            color+=tint*tick*1.4;
                        }
                        color+=tint*scan*(researchMode>1.5?0.30:0.08);
                        float border=step(min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)),0.012);
                        color+=tint*0.45*border;
                        float corners=step(abs(center.x),0.40)*step(0.37,abs(center.x))*step(0.28,abs(center.y));
                        color+=tint*0.65*corners;
                        float charge=step(uv.x,0.18+researchProgress*0.64)*step(0.94,uv.y)*step(uv.y,0.96);
                        color+=tint*charge;
                        float glass=exp(-abs(uv.y+uv.x*0.35-fract(displayTime*0.065)*1.35)*65.0);
                        color+=glass*vec3(0.018,0.045,0.055);
                        if(uv.y>0.82) color=texture2D(statusText,vec2(uv.x,(uv.y-0.82)/0.18)).rgb;
                        if(uv.y<0.13) color=texture2D(identification,vec2(uv.x,uv.y/0.13)).rgb;
                        gl_FragColor=vec4(color,1.0);
                    }
                `
            });
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.76,0.72),screen);
            panel.rotation.set(-Math.PI/2,0,Math.PI);
            panel.position.set(-0.66,0.835,-1.27);
            resources.push(screen,panel.geometry);
            panel.userData.ownedResearchDisplay=true;building.add(panel);
            // A roof-visible segmented charge ring carries the same status at map scale.
            const haloMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
                uniforms:{displayTime:clock,researchMode:mode,researchProgress:progress},
                vertexShader:`varying vec2 haloUv;void main(){haloUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                fragmentShader:`varying vec2 haloUv;uniform float displayTime;uniform float researchMode;uniform float researchProgress;
                    void main(){vec2 p=haloUv-0.5;float r=length(p);float angle=atan(p.y,p.x);float dial=fract((angle+1.5707963)/6.2831853+1.0);
                        float ring=exp(-abs(r-0.405)*220.0);float segments=smoothstep(-0.1,0.1,sin(angle*24.0));
                        vec3 tint=researchMode>1.5?vec3(0.10,0.90,0.68):researchMode>0.5?vec3(1.0,0.40,0.065):vec3(0.08,0.18,0.22);
                        float brightness=researchMode>1.5?0.78+0.12*sin(displayTime*2.3):0.16+0.74*step(dial,researchProgress);
                        float runner=researchMode>0.5&&researchMode<1.5?pow(max(0.0,cos(angle-displayTime*2.3)),24.0)*0.55:0.0;
                        float a=ring*(segments*brightness+runner);gl_FragColor=vec4(tint*1.35,a);}`});
            const halo=new THREE.Mesh(new THREE.PlaneGeometry(1.86,1.86),haloMaterial);
            halo.rotation.x=-Math.PI/2;halo.position.set(-0.49,1.635,0.18);halo.layers.set(1);
            halo.userData.ownedResearchDisplay=true;building.add(halo);resources.push(halo.geometry,haloMaterial);
        },
        unregister: (root: THREE.Object3D): void => {for(let index=displays.length-1;index>=0;index--)if(root.getObjectById(displays[index]!.building.id)){displays[index]!.target.dispose();displays[index]!.resources.forEach(resource=>resource.dispose());displays.splice(index,1);}const panels:THREE.Object3D[]=[];root.traverse(part=>{if(part.userData.ownedResearchDisplay)panels.push(part);});for(const panel of panels)panel.removeFromParent();},
        update: (state: ClientState, seconds: number, x?: number, z?: number, frustum?: THREE.Frustum): void => {
            clock.value = seconds;
            if (seconds-lastCapture < 0.10 || displays.length === 0) return;
            lastCapture = seconds;
            showroomStart??=seconds;
            const now=Date.now();statusClock.sync(state,now);
            const buildings=new Map<string,ClientState["buildings"] extends Map<string,infer B>?B:never>();
            for(const building of state.buildings.values())if(building.type>=400)buildings.set(`${building.tileX},${building.tileY}`,building);
            const previousTarget = renderer.getRenderTarget();
            const previousAlpha = renderer.getClearAlpha();
            renderer.getClearColor(savedColor);
            renderer.setClearColor(0x000000,0);
            for (let i=0;i<displays.length;i++) {
                const display=displays[i]!;
                if(!display.building.parent || !display.building.visible)continue;
                if(x!==undefined && z!==undefined){const dx=display.building.position.x-x,dz=display.building.position.z-z;if(dx*dx+dz*dz>35*35)continue;}
                displayBounds.center.copy(display.building.position);displayBounds.center.y+=1;
                if(frustum && !frustum.intersectsSphere(displayBounds))continue;
                const building=buildings.get(`${display.building.userData.renderTileX},${display.building.userData.renderTileY}`);
                const status=display.demoCycle?demoResearchStatus(seconds-showroomStart):building?statusClock.resolve(state,building,now):{phase:"waiting",progress:0,remainingMs:0,label:"LINK OFFLINE"};
                display.mode.value=status.phase==="ready"?2:status.phase==="researching"?1:0;
                display.progress.value=status.progress;
                const tint=status.phase==="ready"?0x21cba7:status.phase==="researching"?0xe58c2b:0x244553;
                for(const material of display.statusMaterials){material.emissive.setHex(tint);material.emissiveIntensity=status.phase==="ready"?1.3:status.phase==="researching"?1.1+Math.sin(seconds*3.2)*0.15:0.15;}
                display.building.userData.researchPhase=status.phase;
                const remaining=Math.ceil(status.remainingMs/1000),timer=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}`;
                const signature=`${status.label}:${remaining}`;
                if(display.signature!==signature){
                    display.signature=signature;const c=display.statusCanvas.getContext("2d")!;
                    c.fillStyle="#061014";c.fillRect(0,0,384,48);c.textBaseline="middle";c.textAlign="left";c.font="bold 26px monospace";
                    c.fillStyle=status.phase==="ready"?"#80edc8":status.phase==="researching"?"#ffc071":"#63808a";
                    c.fillText(status.label,8,25);if(status.phase==="researching"){c.textAlign="right";c.fillText(timer,376,25);}
                    display.statusTexture.needsUpdate=true;
                }
                display.turntable.rotation.y=seconds*(status.phase==="ready"?0.32:0.10)+i*0.9;
                renderer.setRenderTarget(display.target);
                renderer.render(display.scene,display.camera);
            }
            statusSignature=JSON.stringify(displays.map(display=>[display.building.userData.renderTileX,display.building.userData.renderTileY,display.building.userData.researchPhase]));
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(savedColor,previousAlpha);
        },
        get statusSignature(): string {return statusSignature;},
        dispose: (): void => {
            for (const display of displays) {
                display.target.dispose();
                display.resources.forEach(resource=>resource.dispose());
            }
            displays.length=0;
        }
    };
};

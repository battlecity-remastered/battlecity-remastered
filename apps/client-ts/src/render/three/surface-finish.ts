import * as THREE from "three";

// Material-local detail stays attached to a moving tank and to each animated
// assembly. Reuse material instances, preserving the machinery shader hooks.
export const applySurfaceFinish = (root: THREE.Object3D): void => {
    const finished = new Set<THREE.Material>();
    root.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
        const material = child.material;
        if (finished.has(material) || /glow|core|lamp|orb/i.test(material.name)) return;
        finished.add(material);
        const chrome = /chrome/i.test(material.name);
        if (chrome) material.envMapIntensity = 1.6;
        const painted = /armour/i.test(material.name);
        const paint = /paint|Lettering/i.test(material.name);
        const stone = /apron/i.test(material.name);
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
            previous(shader, renderer);
            shader.vertexShader = shader.vertexShader.replace("#include <common>",
                "#include <common>\nvarying vec2 finishUv;\nvarying vec3 finishPosition;");
            shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>",
                "#include <uv_vertex>\nfinishUv = uv;");
            shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>",
                "#include <begin_vertex>\nfinishPosition = transformed;");
            shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
                #include <common>
                varying vec2 finishUv;
                varying vec3 finishPosition;
                float finishHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
                float finishNoise(vec2 p) {
                    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
                    return mix(mix(finishHash(i),finishHash(i+vec2(1,0)),f.x),
                        mix(finishHash(i+vec2(0,1)),finishHash(i+vec2(1,1)),f.x),f.y);
                }
            `);
            shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
                #include <color_fragment>
                ${paint ? `
                    float fleck = finishNoise(finishPosition.xz*210.0);
                    if(fleck<0.23) discard;
                    diffuseColor.rgb *= 0.72+fleck*0.45;
                ` : ""}
                float patina = finishNoise(finishPosition.xz * ${chrome ? "9.0" : "32.0"} + finishPosition.y * ${chrome ? "7.0" : "17.0"});
                float brushed = finishNoise(finishUv * vec2(850.0,32.0));
                float border = min(min(finishUv.x,1.0-finishUv.x),min(finishUv.y,1.0-finishUv.y));
                float wear = (1.0-smoothstep(0.004,0.035,border)) * smoothstep(0.48,0.8,patina);
                diffuseColor.rgb *= ${stone ? "0.70 + patina * 0.30" : chrome ? "0.94 + patina * 0.06" : "0.80 + patina * 0.22 + brushed * 0.06"};
                ${stone ? `
                    float stains = finishNoise(finishPosition.xz*4.0);
                    float aggregate = finishNoise(finishPosition.xz*95.0);
                    float approach = (1.0-smoothstep(0.22,0.75,abs(finishPosition.x)))
                        * (1.0-smoothstep(1.15,1.9,abs(finishPosition.z)));
                    diffuseColor.rgb *= 0.82+stains*0.23+aggregate*0.09;
                    diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.105,0.12,0.115),approach*0.22);
                ` : ""}
                ${painted ? "diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.22,0.24,0.24),wear * 0.55);" : ""}
            `);
            shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
                #include <roughnessmap_fragment>
                roughnessFactor = clamp(roughnessFactor + (patina-0.5) * ${stone ? "0.12" : chrome ? "0.06" : "0.22"}
                    + (brushed-0.5) * 0.06,0.18,0.98);
            `);
            if (stone) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
                #include <normal_fragment_maps>
                float relief = finishNoise(finishPosition.xz*26.0)*0.0012;
                vec3 dx = dFdx(vViewPosition), dy = dFdy(vViewPosition);
                vec3 rx = cross(dy,normal), ry = cross(normal,dx);
                float determinant = dot(dx,rx);
                normal = normalize(abs(determinant)*normal + sign(determinant)*(dFdx(relief)*rx+dFdy(relief)*ry));
            `);
        };
        material.customProgramCacheKey = () => `${previousKey}-finish-${painted}-${stone}-${paint}-${chrome}-v4`;
    });
};

export const createOutdoorEnvironment = (renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget => {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: `varying vec3 skyDirection; void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `
            varying vec3 skyDirection;
            void main(){
                vec3 d=normalize(skyDirection);
                vec3 sky=mix(vec3(0.21,0.23,0.25),vec3(0.10,0.17,0.25),pow(max(d.y,0.0),0.45));
                sky=mix(vec3(0.044,0.035,0.028),sky,smoothstep(-0.25,0.04,d.y));
                float sun=max(dot(d,normalize(vec3(-9.0,18.0,-8.0))),0.0);
                sky+=vec3(1.1,0.83,0.54)*pow(sun,48.0)+vec3(0.24,0.20,0.15)*pow(sun,5.0);
                gl_FragColor=vec4(sky,1.0);
            }
        `
    });
    const geometry = new THREE.SphereGeometry(100,32,16);
    scene.add(new THREE.Mesh(geometry,material));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(scene,0.015);
    geometry.dispose(); material.dispose(); pmrem.dispose();
    return environment;
};

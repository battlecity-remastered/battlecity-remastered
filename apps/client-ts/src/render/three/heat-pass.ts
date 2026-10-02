import * as THREE from "three";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Heat distortion and vignette feed tone mapping directly, avoiding another
// fullscreen HDR framebuffer write/read. OutputPass retains the renderer's
// exposure, tone mapping and output color-space handling.
export const createHeatOutputPass = (): OutputPass => {
    const pass = new OutputPass();
    pass.uniforms.heatTime = { value: 0 };
    pass.uniforms.heatResolution = { value: new THREE.Vector2(1,1) };
    pass.material.glslVersion = THREE.GLSL3;
    pass.material.vertexShader = "#define attribute in\n#define varying out\n" + pass.material.vertexShader;
    pass.material.fragmentShader = `
        #define varying in
        #define texture2D texture
        layout(location = 0) out highp vec4 heatFragColor;
        #define gl_FragColor heatFragColor
    ` + pass.material.fragmentShader.replace("uniform sampler2D tDiffuse;", `
        uniform sampler2D tDiffuse;
        uniform float heatTime;
        uniform vec2 heatResolution;
        float hot(vec3 c){return smoothstep(0.22,0.9,c.r-c.g)*smoothstep(0.05,0.18,c.g);}
    `).replace("gl_FragColor = texture2D( tDiffuse, vUv );", `
            vec3 base=texture2D(tDiffuse,vUv).rgb;
            float heat=max(hot(base),hot(texture2D(tDiffuse,vUv-vec2(0,7.0)/heatResolution).rgb)*0.65);
            vec3 color=base;
            if(heat>0.0){
                vec2 turbulence=vec2(sin(vUv.y*420.0+vUv.x*80.0-heatTime*2.8),
                    sin(vUv.x*290.0+vUv.y*130.0+heatTime*2.1));
                // HDR input has no mipmaps. Explicit LOD keeps sampling defined
                // inside the conditional and preserves its linear base-level filter.
                color=textureLod(tDiffuse,vUv+turbulence*heat*1.15/heatResolution,0.0).rgb;
            }
            vec2 centered=vUv*2.0-1.0;
            color*=1.0-0.065*smoothstep(0.3,1.4,dot(centered,centered));
            // Retain the previous HDR intermediate's half-float truncation,
            // so merging the passes does not subtly change the final colours.
            highp uint rg=packHalf2x16(color.rg),ba=packHalf2x16(vec2(color.b,1.0));
            vec2 roundedRg=unpackHalf2x16(rg),roundedBa=unpackHalf2x16(ba);
            rg-=uint(abs(roundedRg.x)>abs(color.r))+uint(abs(roundedRg.y)>abs(color.g))*65536u;
            ba-=uint(abs(roundedBa.x)>abs(color.b));
            gl_FragColor=vec4(unpackHalf2x16(rg),unpackHalf2x16(ba));
    `);
    return pass;
};

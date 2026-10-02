// Shader source is kept separate from lifecycle and simulation code.
export const materialPatch1 = `
                        #include <emissivemap_fragment>
                        float circuit = pow(0.5 + 0.5 * sin(machineUv.x * 12.56637 - machineTime * 3.4), 6.0);
                        totalEmissiveRadiance *= 0.65 + circuit * 3.5;
                    `;

export const materialPatch2 = `
                        #include <emissivemap_fragment>
                        vec3 q = machinePosition*17.0;
                        float eddy = 0.5+0.5*sin(q.x-q.z+machineTime+sin(q.y));
                        float fold = sin(q.x*1.9+sin(q.y*1.4+machineTime))*sin(q.z*1.5+machineTime*0.6);
                        float veins = pow(1.0-abs(sin(fold*3.6+q.y-machineTime*1.7)),14.0);
                        float surge = pow(0.5+0.5*sin(machineTime*2.4),8.0);
                        diffuseColor.rgb = mix(vec3(0.012,0.003,0.05),vec3(0.015,0.035,0.13),eddy);
                        totalEmissiveRadiance = vec3(0.055,0.013,0.24)*(0.8+eddy*0.5)
                            + veins*mix(vec3(0.20,0.07,0.85),vec3(0.12,1.25,2.8),surge)
                            + vec3(0.07,0.03,0.23)*surge;
                    `;

export const materialPatch3 = `
                        #include <emissivemap_fragment>
                        vec2 d = machineUv-0.5;
                        float ring = 1.0-smoothstep(0.006,0.023,abs(length(d)-(0.20+0.025*sin(machineTime))));
                        float sweep = pow(0.5+0.5*sin(machineUv.y*25.0-machineTime*2.4),16.0);
                        float grid = step(0.92,fract(machineUv.x*10.0))+step(0.92,fract(machineUv.y*10.0));
                        totalEmissiveRadiance = vec3(0.02,0.38,0.62)*(ring*1.2+grid*0.08+sweep*0.25);
                    `;

export const materialPatch4 = `
                        #include <emissivemap_fragment>
                        totalEmissiveRadiance *= 0.45+0.20*sin(machineTime*2.0+machineUv.x*9.0);
                    `;

export const materialPatch5 = `
                        #include <emissivemap_fragment>
                        float pulse = pow(0.5+0.5*sin(machineTime*2.8+machineUv.x*12.57),5.0);
                        totalEmissiveRadiance *= 0.45+pulse*1.1;
                    `;

export const materialPatch6 = `
                        #include <emissivemap_fragment>
                        float charge = 0.5 + 0.5 * sin(machineTime * 1.6);
                        float scan = pow(0.5 + 0.5 * sin(machineUv.y * 18.85 - machineTime * 4.0), 10.0);
                        totalEmissiveRadiance *= 0.15 + charge * charge * 0.6 + scan * 0.95;
                    `;

export const vertexShader1 = `
                uniform float energyTime; attribute float arcProgress;
                varying float arcT;
                void main(){
                    arcT=arcProgress;
                    vec3 p=position;
                    float pulse=floor(energyTime*22.0);
                    p.x+=sin(arcT*93.0+pulse*2.7)*0.025*sin(arcT*3.14159);
                    p.y+=sin(arcT*79.0-pulse*1.9)*0.028*sin(arcT*3.14159);
                    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
                }
            `;

export const fragmentShader1 = `
                uniform float energyTime; uniform vec3 energyColor; varying float arcT;
                void main(){
                    float pulse=pow(0.5+0.5*sin(energyTime*14.0-arcT*18.0),3.0);
                    gl_FragColor=vec4(energyColor,0.25+pulse*0.7);
                }
            `;

export const vertexShader2 = `
                uniform float energyTime; uniform float particleRatio;
                attribute float steamSeed; varying float steamLife;
                void main(){
                    float age=fract(energyTime*0.20+steamSeed);steamLife=age;
                    vec3 p=position;
                    p.y+=age*(0.9+steamSeed*0.6);p.x+=age*0.23+sin(age*8.0+steamSeed*31.0)*0.07;
                    p.z+=age*0.12;
                    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
                    gl_PointSize=(8.0+age*22.0)*particleRatio;
                }
            `;

export const fragmentShader2 = `
                varying float steamLife;
                void main(){
                    vec2 p=gl_PointCoord*2.0-1.0;
                    float cloud=exp(-dot(p,p)*3.5);
                    float fade=smoothstep(0.0,0.12,steamLife)*(1.0-steamLife);
                    gl_FragColor=vec4(vec3(0.66,0.72,0.73),cloud*fade*0.10);
                }
            `;

export const vertexShader3 = `
                    attribute float moteSeed;uniform float energyTime;uniform float particleRatio;
                    varying float moteLife;varying float moteTint;
                    void main(){
                        float age=fract(energyTime*(0.35+moteSeed*0.15)+moteSeed);
                        float angle=moteSeed*62.8319+energyTime*(1.2+moteSeed);
                        float radius=0.25+age*0.13;
                        vec3 p=vec3(cos(angle)*radius,0.18+age*0.60,sin(angle)*radius);
                        moteLife=age;moteTint=moteSeed;
                        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
                        gl_PointSize=(1.2+pow(1.0-age,3.0)*3.4)*particleRatio;
                    }
                `;

export const fragmentShader3 = `
                    varying float moteLife;varying float moteTint;
                    void main(){
                        vec2 p=gl_PointCoord*2.0-1.0;
                        float sparkle=exp(-dot(p,p)*5.0);
                        float fade=smoothstep(0.0,0.1,moteLife)*(1.0-moteLife);
                        gl_FragColor=vec4(mix(vec3(0.5,0.13,2.2),vec3(0.15,1.2,2.5),moteTint),sparkle*fade);
                    }
                `;

export const vertexShader4 = `
            attribute float emberSeed;
            uniform float emberTime;
            uniform float emberPixelRatio;
            varying float emberLife;
            void main() {
                float life = fract(emberTime * (0.24 + emberSeed * 0.1) + emberSeed);
                emberLife = life;
                vec3 p = position;
                p.y += life * (0.45 + emberSeed * 0.65);
                p.x += life * sin(emberTime * 0.8 + emberSeed * 35.0) * 0.12;
                p.z -= life * 0.15;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                gl_PointSize = (2.0 + emberSeed * 2.5) * (1.0 - life * 0.65) * emberPixelRatio;
            }
        `;

export const fragmentShader4 = `
            varying float emberLife;
            void main() {
                vec2 p = gl_PointCoord * 2.0 - 1.0;
                float soft = exp(-dot(p,p) * 4.0);
                float fade = smoothstep(0.0,0.12,emberLife) * (1.0 - emberLife);
                gl_FragColor = vec4(mix(vec3(2.8,0.8,0.04), vec3(1.5,0.09,0.0),emberLife),soft * fade);
            }
        `;

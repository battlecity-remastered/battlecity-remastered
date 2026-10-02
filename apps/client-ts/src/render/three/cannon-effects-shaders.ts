// Shader source is kept separate from lifecycle and simulation code.
export const vertexShader1 = `
            attribute vec3 particleColor;attribute float particleSize;attribute float particleOpacity;attribute float particleKind;
            uniform float particleRatio;varying vec3 pColor;varying float pOpacity;varying float pKind;
            void main(){pColor=particleColor;pOpacity=particleOpacity;pKind=particleKind;
                gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
                gl_PointSize=max(1.0,particleSize*48.0*particleRatio);}
        `;

export const fragmentShader1 = `
            varying vec3 pColor;varying float pOpacity;varying float pKind;
            void main(){vec2 p=gl_PointCoord*2.0-1.0;float r=dot(p,p);
                float flecks=0.75+0.25*sin(p.x*17.0+sin(p.y*13.0));
                float cloud=exp(-r*(pKind>0.5&&pKind<1.5?5.0:3.4));
                gl_FragColor=vec4(pColor,pOpacity*cloud*(pKind<0.5?flecks:1.0));}
        `;

export const fragmentShader2 = `uniform float flashLife;uniform float flashSeed;uniform float laserFlash;varying vec2 flashUv;
                void main(){float breakup=0.6+0.4*sin(flashUv.x*38.0+flashUv.y*24.0+flashSeed);
                    float flame=pow(1.0-flashUv.y,0.8)*breakup*flashLife;
                    vec3 color=mix(vec3(5.0,2.8,0.8),vec3(2.8,0.55,0.035),flashUv.y);
                    color=mix(color,vec3(0.35,3.5,5.0),laserFlash);
                    gl_FragColor=vec4(color,flame);}`;

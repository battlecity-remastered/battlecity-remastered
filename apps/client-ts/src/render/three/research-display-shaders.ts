// Shader source is kept separate from lifecycle and simulation code.
export const fragmentShader1 = `
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
                `;

export const fragmentShader2 = `varying vec2 haloUv;uniform float displayTime;uniform float researchMode;uniform float researchProgress;
                    void main(){vec2 p=haloUv-0.5;float r=length(p);float angle=atan(p.y,p.x);float dial=fract((angle+1.5707963)/6.2831853+1.0);
                        float ring=exp(-abs(r-0.405)*220.0);float segments=smoothstep(-0.1,0.1,sin(angle*24.0));
                        vec3 tint=researchMode>1.5?vec3(0.10,0.90,0.68):researchMode>0.5?vec3(1.0,0.40,0.065):vec3(0.08,0.18,0.22);
                        float brightness=researchMode>1.5?0.78+0.12*sin(displayTime*2.3):0.16+0.74*step(dial,researchProgress);
                        float runner=researchMode>0.5&&researchMode<1.5?pow(max(0.0,cos(angle-displayTime*2.3)),24.0)*0.55:0.0;
                        float a=ring*(segments*brightness+runner);gl_FragColor=vec4(tint*1.35,a);}`;

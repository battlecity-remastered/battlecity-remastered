// Shader source is kept separate from lifecycle and simulation code.
export const materialPatch1 = `
varying vec3 terrainPosition;
uniform float terrainTime;
uniform sampler2D terrainMask;
uniform sampler2D terrainMineral;
uniform float terrainMapSize;
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
               mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float n = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) {
        n += a * noise2(p);
        p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03 + 13.1;
        a *= 0.5;
    }
    return n;
}
vec2 cells(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float first = 9.0, second = 9.0;
    for(int y=-1; y<=1; y++) for(int x=-1; x<=1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 jitter = vec2(hash21(i+g), hash21(i+g+19.3));
        float d = length(g + 0.2 + jitter * 0.6 - f);
        if(d < first) { second = first; first = d; }
        else if(d < second) second = d;
    }
    return vec2(first, second-first);
}
// Distance to the opposite surface, using the actual map cells. The noisy
// cooling/scorch blend is continuous across chunks and follows concave shores.
float shoreDistance(vec2 p, float ownSurface) {
    vec2 cell = floor(p + vec2(256.0));
    float distance = 2.0;
    for(int z=-1; z<=1; z++) for(int x=-1; x<=1; x++) {
        vec2 neighbor = cell + vec2(float(x),float(z));
        float molten = texture2D(terrainMask,(neighbor+0.5)/terrainMapSize).r;
        if(abs(molten-ownSurface)>0.5) {
            vec2 delta = max(abs(p+256.0-(neighbor+0.5))-0.5,0.0);
            distance = min(distance,length(delta));
        }
    }
    return distance;
}
// Filtering the binary cell field rounds the lake corners. Low-frequency
// erosion breaks up straight edges; openings stay inside blocked lava cells.
float lakeOpening(vec2 p) {
    vec2 warp = vec2(noise2(p*5.0),noise2(p*5.0+27.4))-0.5;
    return texture2D(terrainMask,(p+256.0+warp*0.34)/terrainMapSize).r - (noise2(p*2.3)-0.5)*0.10;
}
float stoneHeight(vec2 p) {
    return fbm(p * 5.0) * 0.028 + noise2(p * 85.0) * 0.002;
}
`;

export const materialPatch2 = `
            vec4 terrainWorld = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
                terrainWorld = instanceMatrix * terrainWorld;
            #endif
            terrainPosition = (modelMatrix * terrainWorld).xyz;
            #include <project_vertex>
        `;

export const materialPatch3 = `
            #include <color_fragment>
            vec2 p = terrainPosition.xz;
            float cellLava = texture2D(terrainMask,(floor(p+256.0)+0.5)/terrainMapSize).r;
            if(cellLava>0.5 && lakeOpening(p)>0.54) discard;
            float broad = fbm(p * 0.4);
            float strata = fbm(p * 6.0);
            vec3 mineral = texture2D(map, p * 0.25).rgb;
            diffuseColor.rgb = mineral * (0.58 + broad * 0.28 + strata * 0.10);
        `;

export const materialPatch4 = `
            #include <roughnessmap_fragment>
            roughnessFactor = mix(0.94,0.30,heat);
        `;

export const materialPatch5 = `
            #include <normal_fragment_maps>
            // Derivatives of world-space relief keep the surface readable at any zoom.
            float relief = stoneHeight(terrainPosition.xz);
            #ifndef USE_MAP
                // Select the relief before taking derivatives below. Both
                // functions are pure noise: no texture derivatives in the branch.
                if (liquid > 0.0) {
                    relief = fbm((terrainPosition.xz - vec2(0.16,-0.10) * terrainTime) * 7.0)*0.012;
                } else {
                    relief = stoneHeight(terrainPosition.xz)*0.15;
                }
            #endif
            #ifdef USE_MAP
                relief += dot(texture2D(map, terrainPosition.xz * 0.25).rgb,vec3(0.299,0.587,0.114)) * 0.035;
            #endif
            vec3 surfX = dFdx(vViewPosition), surfY = dFdy(vViewPosition);
            vec3 r1 = cross(surfY, normal), r2 = cross(normal, surfX);
            float det = dot(surfX, r1);
            vec3 grad = sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2);
            normal = normalize(abs(det) * normal + grad);
        `;

export const materialPatch6 = `
                    #include <clipping_planes_fragment>
                    if(depthTerrainKind>0.5 && depthTerrainKind<1.5) {
                        vec2 p = terrainPosition.xz;
                        float cellLava = texture2D(terrainMask,(floor(p+256.0)+0.5)/terrainMapSize).r;
                        if(cellLava>0.5 && lakeOpening(p)>0.54) discard;
                    }
                `;

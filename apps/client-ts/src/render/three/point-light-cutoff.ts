import { ShaderChunk } from "three";

// Three's PBR loop evaluates every point light, even beyond its finite range.
// Outside that range its attenuation is exactly zero: skip the normalization,
// attenuation and BRDF work without changing a contributing light's shading.
export const withPointLightCutoff = (source: string): string => {
    if (source.includes("bcPointLightDelta")) return source;
    const begin = "\tPointLight pointLight;";
    const sample = "\t\tgetPointLightInfo( pointLight, geometryPosition, directLight );";
    const end = "\n\t}\n\t#pragma unroll_loop_end";
    const sampleAt = source.indexOf(sample), endAt = source.indexOf(end, sampleAt);
    if (!source.includes(begin) || sampleAt < 0 || endAt < 0) return source;
    const guarded = source.slice(0, endAt) + "\n\t\t}" + source.slice(endAt);
    return guarded.replace(begin, `${begin}\n\tvec3 bcPointLightDelta;`).replace(sample, `
        bcPointLightDelta = pointLight.position - geometryPosition;
        if ( pointLight.distance <= 0.0 || dot( bcPointLightDelta, bcPointLightDelta ) < pointLight.distance * pointLight.distance ) {
${sample}`);
};

export const enablePointLightCutoff = (): void => {
    ShaderChunk.lights_fragment_begin = withPointLightCutoff(ShaderChunk.lights_fragment_begin);
};

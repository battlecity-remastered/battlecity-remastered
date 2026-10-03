import type { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OrthographicCamera } from "three";

// The gameplay camera has a diagonal orthographic projection. Preserve the
// original perspective path; omit zero matrix products and homogeneous divide
// only for the orthographic path, including all original depth samples.
export const specialiseOrthographicAO = (ao: GTAOPass): void => {
    if (!(ao.camera instanceof OrthographicCamera)) return;
    for (const material of [ao.gtaoMaterial, ao.pdMaterial]) {
        material.fragmentShader = material.fragmentShader.replace(
            "vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;\n\t\t\treturn viewSpacePosition.xyz / viewSpacePosition.w;",
            "return clipSpacePosition.xyz * vec3(cameraProjectionMatrixInverse[0][0], cameraProjectionMatrixInverse[1][1], cameraProjectionMatrixInverse[2][2]) + cameraProjectionMatrixInverse[3].xyz;"
        );
    }
    ao.gtaoMaterial.fragmentShader = ao.gtaoMaterial.fragmentShader.replace(
        "pow(float(j + 1) / float(STEPS), distanceExponent)",
        "(distanceExponent == 2.0 ? (float(j + 1) / float(STEPS)) * (float(j + 1) / float(STEPS)) : pow(float(j + 1) / float(STEPS), distanceExponent))"
    ).replace("ao = pow(ao, scale);", "if (scale != 1.0) ao = pow(ao, scale);");
};

import type { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import type { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** Configure before the first render: fullscreen filters only need colour storage. */
export const configurePostprocessTargets = (ao: GTAOPass, bloom: UnrealBloomPass): void => {
    // Preserve the normal/depth target used by AO and the multisampled scene depth.
    for (const target of [ao.gtaoRenderTarget, ao.pdRenderTarget, bloom.renderTargetBright,
        ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]) {
        target.depthBuffer = false;
    }
};

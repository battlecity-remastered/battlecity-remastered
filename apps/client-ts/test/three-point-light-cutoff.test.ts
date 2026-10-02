import test from "node:test";
import assert from "node:assert/strict";
import { ShaderChunk } from "three";
import { withPointLightCutoff } from "../src/render/three/point-light-cutoff.js";

test("finite-light cutoff guards only the point-light loop and retains the original shading", () => {
    const source = ShaderChunk.lights_fragment_begin, patched = withPointLightCutoff(source);
    assert.notEqual(patched, source, "recheck the optimization when Three's shader layout changes");
    assert.equal(withPointLightCutoff(patched), patched, "recreating the renderer must not nest guards");
    assert.ok(patched.includes("pointLight.distance <= 0.0"), "unbounded point lights remain active");
    const tail = "#if ( NUM_SPOT_LIGHTS > 0 )";
    assert.equal(patched.slice(patched.indexOf(tail)), source.slice(source.indexOf(tail)), "spot, sun and indirect lighting remain byte-for-byte unchanged");
    assert.ok(patched.indexOf("dot( bcPointLightDelta") < patched.indexOf("getPointLightInfo( pointLight"));
    assert.equal((patched.match(/RE_Direct\( directLight/g) ?? []).length, (source.match(/RE_Direct\( directLight/g) ?? []).length);
});

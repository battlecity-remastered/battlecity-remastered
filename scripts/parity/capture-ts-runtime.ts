import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDeterministicParityFixture } from "../../apps/client-ts/test/fixtures/parity/deterministic-render-fixture.ts";

const fixture = createDeterministicParityFixture();

const runtimeSnapshot = {
    surface: {
        width: fixture.viewport.surfaceWidth,
        height: fixture.viewport.surfaceHeight
    },
    world: {
        width: fixture.viewport.worldWidth,
        height: fixture.viewport.worldHeight,
        centerX: fixture.viewport.centerX,
        centerY: fixture.viewport.centerY,
        panelStartX: fixture.viewport.panelStartX
    },
    localPlayer: {
        id: fixture.state.local.id,
        city: fixture.state.local.city,
        x: fixture.state.local.x,
        y: fixture.state.local.y,
        direction: fixture.state.local.direction
    },
    fixtureCounts: {
        buildings: fixture.state.buildings.size,
        defenses: fixture.state.defenses.size,
        hazards: fixture.state.hazards.size,
        remotePlayers: fixture.state.remotePlayers.size
    }
};

const outputPath = resolve(process.cwd(), "scripts/parity/runtime-snapshot.json");
writeFileSync(outputPath, `${JSON.stringify(runtimeSnapshot, null, 2)}\n`, "utf8");

console.log(outputPath);
console.log(JSON.stringify(runtimeSnapshot, null, 2));

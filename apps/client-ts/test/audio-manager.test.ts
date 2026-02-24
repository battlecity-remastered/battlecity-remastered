import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { createAudioManager, detectAudioCues } from "../src/audio/AudioManager.js";
import { createMusicManager } from "../src/audio/MusicManager.js";

test("audio manager tick/dispose are safe when AudioContext is unavailable", () => {
    const state = createClientState();
    const audio = createAudioManager(state);
    assert.doesNotThrow(() => audio.tick());
    assert.doesNotThrow(() => audio.dispose());
});

test("music manager tick/dispose run without side effects", () => {
    const state = createClientState();
    const music = createMusicManager(state);
    assert.doesNotThrow(() => music.tick());
    assert.doesNotThrow(() => music.dispose());
});

test("detectAudioCues identifies orb and denial transitions", () => {
    const state = createClientState();
    const baseline = {
        localHealth: 100,
        promotionCount: 0,
        lastShotAt: 10,
        lastOrbedCityId: null,
        lastBuildDeniedReason: null,
        lastDemolishDeniedReason: null
    };

    state.events.lastOrbedCityId = 3;
    state.events.lastBuildDeniedReason = "research_required";
    state.events.lastDemolishDeniedReason = "not_mayor";

    const detected = detectAudioCues(state, baseline);
    assert.deepEqual(
        detected.cues,
        ["orb", "build_denied", "demolish_denied"]
    );
});

import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { createAudioManager } from "../src/audio/AudioManager.js";
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

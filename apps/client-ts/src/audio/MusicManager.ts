import type { ClientState } from "../app/state.js";

type MusicRuntime = {
    tick: () => void;
    dispose: () => void;
};

export const createMusicManager = (state: ClientState): MusicRuntime => {
    let phase = 0;
    return {
        tick: () => {
            if (!state.ui.audioEnabled) {
                return;
            }
            phase = (phase + 1) % 512;
        },
        dispose: () => {}
    };
};

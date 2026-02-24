import type { ClientState } from "../app/state.js";

type MaybeAudioContext = AudioContext | null;

type AudioRuntime = {
    tick: () => void;
    dispose: () => void;
};

type AudioCue = "damage" | "promotion" | "shot" | "orb" | "build_denied" | "demolish_denied";

type AudioCueSnapshot = {
    localHealth: number;
    promotionCount: number;
    lastShotAt: number;
    lastOrbedCityId: number | null;
    lastBuildDeniedReason: string | null;
    lastDemolishDeniedReason: string | null;
};

const readAudioCueSnapshot = (state: ClientState): AudioCueSnapshot => {
    return {
        localHealth: state.local.health,
        promotionCount: state.events.promotions.length,
        lastShotAt: state.local.lastShotAt,
        lastOrbedCityId: state.events.lastOrbedCityId,
        lastBuildDeniedReason: state.events.lastBuildDeniedReason,
        lastDemolishDeniedReason: state.events.lastDemolishDeniedReason
    };
};

export const detectAudioCues = (
    state: ClientState,
    previous: AudioCueSnapshot
): { cues: AudioCue[]; next: AudioCueSnapshot; } => {
    const cues: AudioCue[] = [];
    if (state.local.health < previous.localHealth) {
        cues.push("damage");
    }
    if (state.events.promotions.length > previous.promotionCount) {
        cues.push("promotion");
    }
    if (state.local.lastShotAt > previous.lastShotAt) {
        cues.push("shot");
    }
    if (state.events.lastOrbedCityId !== null && state.events.lastOrbedCityId !== previous.lastOrbedCityId) {
        cues.push("orb");
    }
    if (state.events.lastBuildDeniedReason && state.events.lastBuildDeniedReason !== previous.lastBuildDeniedReason) {
        cues.push("build_denied");
    }
    if (state.events.lastDemolishDeniedReason && state.events.lastDemolishDeniedReason !== previous.lastDemolishDeniedReason) {
        cues.push("demolish_denied");
    }
    return {
        cues,
        next: readAudioCueSnapshot(state)
    };
};

const canUseAudioContext = (): boolean => {
    return typeof window !== "undefined" && "AudioContext" in window;
};

const createContext = (): MaybeAudioContext => {
    if (!canUseAudioContext()) {
        return null;
    }
    return new window.AudioContext();
};

const playTone = (context: AudioContext, frequency: number, durationMs: number): void => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.03;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const now = context.currentTime;
    oscillator.start(now);
    oscillator.stop(now + (durationMs / 1000));
};

export const createAudioManager = (state: ClientState): AudioRuntime => {
    const context = createContext();
    let snapshot = readAudioCueSnapshot(state);

    const playCue = (cue: AudioCue): void => {
        if (!context) {
            return;
        }
        if (cue === "damage") {
            playTone(context, 160, 90);
            return;
        }
        if (cue === "promotion") {
            playTone(context, 660, 120);
            return;
        }
        if (cue === "shot") {
            playTone(context, 420, 35);
            return;
        }
        if (cue === "orb") {
            playTone(context, 250, 180);
            return;
        }
        if (cue === "build_denied") {
            playTone(context, 180, 70);
            return;
        }
        playTone(context, 210, 70);
    };

    return {
        tick: () => {
            if (!context || !state.ui.audioEnabled) {
                return;
            }
            const detected = detectAudioCues(state, snapshot);
            snapshot = detected.next;
            for (const cue of detected.cues) {
                playCue(cue);
            }
        },
        dispose: () => {
            if (context) {
                void context.close();
            }
        }
    };
};

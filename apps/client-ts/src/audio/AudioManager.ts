import type { ClientState } from "../app/state.js";

type MaybeAudioContext = AudioContext | null;

type AudioRuntime = {
    tick: () => void;
    dispose: () => void;
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
    let lastHealth = state.local.health;
    let lastPromotionCount = state.events.promotions.length;
    let lastShotAt = state.local.lastShotAt;

    return {
        tick: () => {
            if (!context || !state.ui.audioEnabled) {
                return;
            }
            if (state.local.health < lastHealth) {
                playTone(context, 160, 90);
            }
            lastHealth = state.local.health;

            if (state.events.promotions.length > lastPromotionCount) {
                playTone(context, 660, 120);
            }
            lastPromotionCount = state.events.promotions.length;

            if (state.local.lastShotAt > lastShotAt) {
                playTone(context, 420, 35);
            }
            lastShotAt = state.local.lastShotAt;
        },
        dispose: () => {
            if (context) {
                void context.close();
            }
        }
    };
};

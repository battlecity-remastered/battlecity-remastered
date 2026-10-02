import type { ClientState } from "./state-types.js";

export const createMovementState = (): ClientState["movement"] => ({
    nextSeq: 1, lastAck: 0, lastSentSeq: 0, pending: [], pendingMs: 0, retryAt: 0,
    visualOffsetX: 0, visualOffsetY: 0, correctionPx: 0, maxCorrectionPx: 0, serverClippedMs: 0
});

import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "../../app/state.js";

const CHAT_HISTORY_LINES = 6;

export const parseChatDraft = (
    draft: string
): KnownEventPayloadByType["chat.message.request"] | null => {
    const trimmed = draft.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed === "/g") {
        return null;
    }
    if (trimmed.startsWith("/g ")) {
        const text = trimmed.slice(3).trim();
        if (!text) {
            return null;
        }
        return {
            text,
            scope: "global"
        };
    }
    return {
        text: trimmed,
        scope: "team"
    };
};

export const buildChatLines = (state: ClientState): string[] => {
    const tail = state.chat.history.slice(-CHAT_HISTORY_LINES);
    const lines = tail.map((message) => {
        const scope = message.scope === "global" ? "G" : "T";
        return `[${scope}] ${message.from}: ${message.text}`;
    });
    if (lines.length === 0) {
        lines.push("No chat messages");
    }
    const rateLimitLine = state.chat.rateLimitedUntil && state.chat.rateLimitedUntil > Date.now()
        ? `Rate limited until ${state.chat.rateLimitedUntil}`
        : "Rate limit: clear";
    return [...lines, rateLimitLine];
};

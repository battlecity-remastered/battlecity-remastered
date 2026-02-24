import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { EventSender } from "../../network/events.js";
import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

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

type ChatManager = {
    render: () => void;
    dispose: () => void;
};

const maybeSendChat = (
    send: EventSender,
    draft: string
): boolean => {
    const payload = parseChatDraft(draft);
    if (!payload) {
        return false;
    }
    send("chat.message.request", payload);
    return true;
};

export const createChatManager = (
    state: ClientState,
    send: EventSender,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): ChatManager => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("div");
    panel.setAttribute("data-ui", "chat");
    panel.style.position = "fixed";
    panel.style.left = "12px";
    panel.style.bottom = "12px";
    panel.style.width = "380px";
    panel.style.padding = "10px";
    panel.style.background = "rgba(16, 26, 20, 0.76)";
    panel.style.border = "1px solid rgba(145, 198, 166, 0.8)";
    panel.style.color = "#d7f3d3";
    panel.style.font = "12px/1.4 monospace";
    panel.style.zIndex = "60";
    panel.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.35)";

    const output = document.createElement("pre");
    output.style.margin = "0 0 8px 0";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "team chat (Enter), /g for global";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.background = "#121f19";
    input.style.border = "1px solid rgba(145, 198, 166, 0.55)";
    input.style.color = "#e2f8de";
    input.style.padding = "6px";

    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Enter") {
            return;
        }
        event.preventDefault();
        if (state.chat.rateLimitedUntil && state.chat.rateLimitedUntil > Date.now()) {
            return;
        }
        const sent = maybeSendChat(send, input.value);
        if (sent) {
            input.value = "";
        }
    };

    input.addEventListener("keydown", onKeyDown);
    panel.append(output, input);
    root.appendChild(panel);
    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            panel.style.display = state.ui.showOptionsModal || state.ui.showIntroModal ? "none" : "block";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            const text = buildChatLines(state).join("\n");
            const signature = `${panel.style.display}|${panel.style.opacity}|${text}`;
            if (dirty.shouldRender("chat", signature)) {
                output.textContent = text;
            }
        },
        dispose: () => {
            dirty.clear();
            input.removeEventListener("keydown", onKeyDown);
            panel.remove();
        }
    };
};

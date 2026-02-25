import type { ClientState } from "../../app/state.js";

export type ChatScope = "team" | "global";

type NormalizedChatMessage = {
    id: string;
    scope: ChatScope;
    text: string;
    createdAt: number;
    senderCity: number | null;
    senderLabel: string;
};

export type ChatHistoryRenderContext = {
    state: ClientState;
    logElement: HTMLElement;
    menuOpen: boolean;
    messageTimestamps: Map<string, number>;
    messageHideMs: number;
    onNewMessageWhileClosed: () => void;
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normalizeCityId = (value: unknown): number | null => {
    const parsed = toFiniteNumber(value, Number.NaN);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.max(0, Math.floor(parsed));
};

const formatTimestamp = (timestamp: number): string => {
    if (!Number.isFinite(timestamp)) {
        return "";
    }
    return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
};

const normalizeScope = (scope: unknown): ChatScope => {
    return scope === "global" ? "global" : "team";
};

const normalizeChatMessage = (
    entry: ClientState["chat"]["history"][number]
): NormalizedChatMessage | null => {
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!text) {
        return null;
    }
    const createdAt = toFiniteNumber(entry.ts, Date.now());
    const senderLabel = typeof entry.from === "string" && entry.from.trim().length > 0
        ? entry.from.trim()
        : "Player";
    const senderCity = normalizeCityId(entry.city);
    const id = typeof entry.id === "string" && entry.id.length > 0
        ? entry.id
        : `${createdAt}-${Math.random().toString(36).slice(2, 7)}`;
    return {
        id,
        scope: normalizeScope(entry.scope),
        text,
        createdAt,
        senderCity,
        senderLabel
    };
};

export const resolveScopeLabel = (scope: ChatScope): string => {
    return scope === "global" ? "Global" : "Team";
};

const resolveCityLabel = (cityId: number | null): string | null => {
    if (cityId === null) {
        return null;
    }
    return `C${cityId}`;
};

export const buildHistorySignature = (state: ClientState): string => {
    return state.chat.history
        .map((entry) => `${entry.id}|${entry.scope}|${entry.from}|${entry.text}|${entry.ts}|${entry.city}`)
        .join("\n");
};

export const showAllChatMessages = (logElement: HTMLElement): void => {
    const nodes = logElement.querySelectorAll(".battlecity-chat__message");
    for (const node of Array.from(nodes)) {
        if (node instanceof HTMLElement) {
            node.style.display = "flex";
        }
    }
    logElement.style.display = "flex";
};

export const hideOldChatMessages = (logElement: HTMLElement, messageHideMs: number): boolean => {
    const now = Date.now();
    const nodes = logElement.querySelectorAll(".battlecity-chat__message");
    let hasVisible = false;
    for (const node of Array.from(nodes)) {
        if (!(node instanceof HTMLElement)) {
            continue;
        }
        const timestamp = Number.parseInt(node.dataset.timestamp ?? "", 10);
        if (Number.isFinite(timestamp) && (now - timestamp > messageHideMs)) {
            node.style.display = "none";
            continue;
        }
        node.style.display = "flex";
        hasVisible = true;
    }
    logElement.style.display = hasVisible ? "flex" : "none";
    return hasVisible;
};

const renderMessage = (message: NormalizedChatMessage): HTMLElement => {
    const node = document.createElement("div");
    node.className = "battlecity-chat__message";
    node.dataset.scope = message.scope;

    const header = document.createElement("div");
    header.className = "battlecity-chat__messageHeader";

    const scopeBadge = document.createElement("span");
    scopeBadge.className = "battlecity-chat__scopeBadge";
    scopeBadge.dataset.scope = message.scope;
    scopeBadge.textContent = resolveScopeLabel(message.scope);
    header.appendChild(scopeBadge);

    const cityLabel = resolveCityLabel(message.senderCity);
    if (cityLabel) {
        const city = document.createElement("span");
        city.className = "battlecity-chat__city";
        city.textContent = cityLabel;
        header.appendChild(city);
    }

    const sender = document.createElement("span");
    sender.className = "battlecity-chat__sender";
    sender.textContent = message.senderLabel;
    header.appendChild(sender);

    const timeText = formatTimestamp(message.createdAt);
    if (timeText.length > 0) {
        const time = document.createElement("span");
        time.className = "battlecity-chat__time";
        time.textContent = timeText;
        header.appendChild(time);
    }

    const body = document.createElement("div");
    body.className = "battlecity-chat__body";
    body.textContent = message.text;

    node.appendChild(header);
    node.appendChild(body);
    return node;
};

const normalizeChatHistory = (state: ClientState): NormalizedChatMessage[] => {
    return state.chat.history
        .map((entry) => normalizeChatMessage(entry))
        .filter((entry): entry is NormalizedChatMessage => entry !== null);
};

const syncMessageTimestamps = (
    context: ChatHistoryRenderContext,
    normalized: NormalizedChatMessage[]
): void => {
    const visibleIds = new Set<string>();
    for (const message of normalized) {
        visibleIds.add(message.id);
        if (context.messageTimestamps.has(message.id)) {
            continue;
        }
        context.messageTimestamps.set(message.id, Date.now());
        if (!context.menuOpen) {
            context.onNewMessageWhileClosed();
        }
    }
    for (const id of Array.from(context.messageTimestamps.keys())) {
        if (visibleIds.has(id)) {
            continue;
        }
        context.messageTimestamps.delete(id);
    }
};

const renderMessageNodes = (
    context: ChatHistoryRenderContext,
    normalized: NormalizedChatMessage[]
): void => {
    context.logElement.innerHTML = "";
    for (const message of normalized) {
        const node = renderMessage(message);
        const timestamp = context.messageTimestamps.get(message.id) ?? Date.now();
        node.dataset.timestamp = String(timestamp);
        context.logElement.appendChild(node);
    }
    context.logElement.scrollTop = context.logElement.scrollHeight;
};

export const renderChatHistory = (context: ChatHistoryRenderContext): void => {
    const normalized = normalizeChatHistory(context.state);
    syncMessageTimestamps(context, normalized);
    renderMessageNodes(context, normalized);
    if (context.menuOpen) {
        showAllChatMessages(context.logElement);
        return;
    }
    hideOldChatMessages(context.logElement, context.messageHideMs);
};

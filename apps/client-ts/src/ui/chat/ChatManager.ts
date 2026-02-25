import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { EventSender } from "../../network/events.js";
import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const CHAT_HISTORY_LINES = 6;
const CHAT_CONTAINER_ID = "battlecity-chat-container";
const CHAT_TOGGLE_ID = "battlecity-chat-toggle";
const CHAT_STYLES_ID = "battlecity-chat-styles";
const STATUS_TIMEOUT_MS = 3500;
const MESSAGE_HIDE_MS = 10000;

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

type ChatScope = "team" | "global";

type NormalizedChatMessage = {
    id: string;
    scope: ChatScope;
    text: string;
    createdAt: number;
    senderCity: number | null;
    senderLabel: string;
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

const resolveScopeLabel = (scope: ChatScope): string => {
    return scope === "global" ? "Global" : "Team";
};

const resolveCityLabel = (cityId: number | null): string | null => {
    if (cityId === null) {
        return null;
    }
    return `C${cityId}`;
};

const buildHistorySignature = (state: ClientState): string => {
    return state.chat.history
        .map((entry) => `${entry.id}|${entry.scope}|${entry.from}|${entry.text}|${entry.ts}|${entry.city}`)
        .join("\n");
};

const ensureStyles = (): void => {
    if (typeof document === "undefined") {
        return;
    }
    if (document.getElementById(CHAT_STYLES_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = CHAT_STYLES_ID;
    style.textContent = `
        #${CHAT_CONTAINER_ID} {
            position: fixed;
            left: 18px;
            bottom: 84px;
            width: min(360px, 32vw);
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            color: #f5f7ff;
            z-index: 1150;
            pointer-events: none;
        }
        #${CHAT_CONTAINER_ID}[data-connected="false"] .battlecity-chat__input,
        #${CHAT_CONTAINER_ID}[data-connected="false"] .battlecity-chat__scope {
            opacity: 0.55;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__log {
            background: rgba(10, 16, 34, 0.72);
            border: 1px solid rgba(70, 94, 180, 0.45);
            border-radius: 12px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 240px;
            overflow-y: auto;
            pointer-events: auto;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__message {
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 13px;
            line-height: 1.45;
            word-break: break-word;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__messageHeader {
            display: flex;
            gap: 6px;
            align-items: baseline;
            font-size: 12px;
            letter-spacing: 0.2px;
            opacity: 0.8;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__scopeBadge {
            text-transform: uppercase;
            font-weight: 600;
            color: #8fb5ff;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__scopeBadge[data-scope="global"] {
            color: #ffba6b;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__sender {
            font-weight: 600;
            color: #f0f4ff;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__body {
            font-size: 13px;
            letter-spacing: 0.2px;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__form {
            display: flex;
            gap: 6px;
            pointer-events: auto;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__scope {
            appearance: none;
            border: 1px solid rgba(90, 114, 196, 0.6);
            background: rgba(13, 20, 44, 0.9);
            color: #e8eeff;
            border-radius: 10px;
            padding: 6px 10px;
            font-size: 13px;
            font-family: inherit;
            cursor: pointer;
            pointer-events: auto;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__input {
            flex: 1;
            border: 1px solid rgba(90, 114, 196, 0.6);
            background: rgba(18, 26, 52, 0.92);
            color: #f0f6ff;
            border-radius: 10px;
            padding: 8px 12px;
            font-size: 13px;
            font-family: inherit;
            outline: none;
            pointer-events: auto;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__input::placeholder {
            color: rgba(205, 214, 255, 0.65);
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__status {
            min-height: 16px;
            font-size: 12px;
            color: #ffd27d;
            letter-spacing: 0.2px;
            opacity: 0;
            transition: opacity 180ms ease;
            pointer-events: none;
        }
        #${CHAT_CONTAINER_ID} .battlecity-chat__status[data-visible="true"] {
            opacity: 0.85;
        }
        #${CHAT_TOGGLE_ID} {
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: rgba(10, 18, 52, 0.82);
            border: 1px solid rgba(123, 152, 255, 0.35);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.45);
            font-size: 24px;
            color: #f0f6ff;
            cursor: pointer;
            z-index: 1200;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Arial, sans-serif;
            padding: 0;
            margin: 0;
        }
    `;
    document.head.appendChild(style);
};

const createChatContainer = (root: HTMLElement): HTMLElement => {
    const existing = document.getElementById(CHAT_CONTAINER_ID);
    if (existing) {
        return existing;
    }
    const container = document.createElement("div");
    container.id = CHAT_CONTAINER_ID;
    container.setAttribute("data-ui", "chat");
    container.dataset.connected = "true";
    container.innerHTML = `
        <div class="battlecity-chat__log" aria-live="polite"></div>
        <form class="battlecity-chat__form" autocomplete="off">
            <select class="battlecity-chat__scope" aria-label="Chat scope">
                <option value="team">Team</option>
                <option value="global">Global</option>
            </select>
            <input class="battlecity-chat__input" type="text" maxlength="240" placeholder="Team chat…" />
        </form>
        <div class="battlecity-chat__status" role="status"></div>
    `;
    root.appendChild(container);
    return container;
};

const createChatToggle = (root: HTMLElement): HTMLButtonElement => {
    const existing = document.getElementById(CHAT_TOGGLE_ID);
    if (existing instanceof HTMLButtonElement) {
        return existing;
    }
    const button = document.createElement("button");
    button.id = CHAT_TOGGLE_ID;
    button.type = "button";
    button.textContent = "💬";
    button.title = "Toggle Chat";
    root.appendChild(button);
    return button;
};

const maybeSendChat = (
    send: EventSender,
    draft: string,
    scope: ChatScope
): boolean => {
    const trimmed = draft.trim();
    if (!trimmed) {
        return false;
    }
    const fromCommand = parseChatDraft(trimmed);
    const payload = trimmed.startsWith("/g")
        ? fromCommand
        : {
            text: trimmed,
            scope
        };
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

    ensureStyles();
    const container = createChatContainer(root);
    const toggleButton = createChatToggle(root);
    const logElement = container.querySelector(".battlecity-chat__log");
    const formElement = container.querySelector(".battlecity-chat__form");
    const inputElement = container.querySelector(".battlecity-chat__input");
    const scopeElement = container.querySelector(".battlecity-chat__scope");
    const statusElement = container.querySelector(".battlecity-chat__status");

    if (!(logElement instanceof HTMLElement)
        || !(formElement instanceof HTMLFormElement)
        || !(inputElement instanceof HTMLInputElement)
        || !(scopeElement instanceof HTMLSelectElement)
        || !(statusElement instanceof HTMLElement)) {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    let menuOpen = false;
    let chatAlertActive = false;
    let hovered = false;
    let cleanupInterval: number | null = null;
    let statusTimeout: number | null = null;
    let lastRateLimitUntil: number | null = null;
    const messageTimestamps = new Map<string, number>();
    let chatScope: ChatScope = "team";

    const clearChatAlert = (): void => {
        if (!chatAlertActive) {
            return;
        }
        chatAlertActive = false;
        updateToggleVisuals();
        toggleButton.title = menuOpen ? "Close Chat" : "Toggle Chat";
    };

    const showChatAlert = (): void => {
        if (menuOpen) {
            return;
        }
        chatAlertActive = true;
        updateToggleVisuals();
        toggleButton.title = "New chat messages - open chat";
    };

    const updateToggleVisuals = (): void => {
        if (chatAlertActive) {
            toggleButton.style.background = hovered ? "rgba(255, 221, 160, 0.98)" : "rgba(255, 213, 128, 0.95)";
            toggleButton.style.border = "1px solid rgba(255, 186, 99, 0.9)";
            toggleButton.style.color = "#0a1220";
            toggleButton.style.boxShadow = "0 10px 22px rgba(0, 0, 0, 0.6)";
            return;
        }
        toggleButton.style.background = hovered ? "rgba(15, 28, 72, 0.92)" : "rgba(10, 18, 52, 0.82)";
        toggleButton.style.border = "1px solid rgba(123, 152, 255, 0.35)";
        toggleButton.style.color = "#f0f6ff";
        toggleButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.45)";
    };

    const updatePlaceholder = (): void => {
        const scopeLabel = resolveScopeLabel(chatScope);
        inputElement.placeholder = `${scopeLabel} chat...`;
    };

    const focusInput = (): void => {
        if (typeof window === "undefined") {
            return;
        }
        window.requestAnimationFrame(() => {
            inputElement.focus();
        });
    };

    const showStatus = (message: string): void => {
        statusElement.textContent = message;
        if (message.length > 0) {
            statusElement.dataset.visible = "true";
            if (typeof window !== "undefined") {
                if (statusTimeout !== null) {
                    window.clearTimeout(statusTimeout);
                }
                statusTimeout = window.setTimeout(() => {
                    statusElement.dataset.visible = "false";
                    statusElement.textContent = "";
                }, STATUS_TIMEOUT_MS);
            }
            return;
        }
        statusElement.dataset.visible = "false";
    };

    const showAllMessages = (): void => {
        const nodes = logElement.querySelectorAll(".battlecity-chat__message");
        for (const node of nodes) {
            if (node instanceof HTMLElement) {
                node.style.display = "flex";
            }
        }
        logElement.style.display = "flex";
    };

    const hideOldMessages = (): void => {
        const now = Date.now();
        const nodes = logElement.querySelectorAll(".battlecity-chat__message");
        let hasVisible = false;

        for (const node of nodes) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }
            const timestamp = Number.parseInt(node.dataset.timestamp ?? "", 10);
            if (Number.isFinite(timestamp) && (now - timestamp > MESSAGE_HIDE_MS)) {
                node.style.display = "none";
            } else {
                node.style.display = "flex";
                hasVisible = true;
            }
        }

        logElement.style.display = hasVisible ? "flex" : "none";
    };

    const startCleanup = (): void => {
        if (cleanupInterval !== null || typeof window === "undefined") {
            return;
        }
        cleanupInterval = window.setInterval(() => {
            if (!menuOpen) {
                hideOldMessages();
            }
        }, 1000);
    };

    const stopCleanup = (): void => {
        if (cleanupInterval === null || typeof window === "undefined") {
            return;
        }
        window.clearInterval(cleanupInterval);
        cleanupInterval = null;
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

    const renderHistory = (): void => {
        const normalized = state.chat.history
            .map((entry) => normalizeChatMessage(entry))
            .filter((entry): entry is NormalizedChatMessage => entry !== null);

        const visibleIds = new Set<string>();
        for (const message of normalized) {
            visibleIds.add(message.id);
            if (!messageTimestamps.has(message.id)) {
                messageTimestamps.set(message.id, Date.now());
                if (!menuOpen) {
                    showChatAlert();
                }
            }
        }

        for (const id of Array.from(messageTimestamps.keys())) {
            if (!visibleIds.has(id)) {
                messageTimestamps.delete(id);
            }
        }

        logElement.innerHTML = "";
        for (const message of normalized) {
            const node = renderMessage(message);
            const timestamp = messageTimestamps.get(message.id) ?? Date.now();
            node.dataset.timestamp = String(timestamp);
            logElement.appendChild(node);
        }

        logElement.scrollTop = logElement.scrollHeight;
        if (menuOpen) {
            showAllMessages();
            clearChatAlert();
        } else {
            hideOldMessages();
        }
        startCleanup();
    };

    const attachEscapeListener = (): void => {
        document.addEventListener("keydown", onEscapeKeyDown);
    };

    const detachEscapeListener = (): void => {
        document.removeEventListener("keydown", onEscapeKeyDown);
    };

    const showControls = (): void => {
        formElement.style.display = "flex";
        statusElement.style.display = "block";
        showAllMessages();
        clearChatAlert();
        focusInput();
    };

    const hideControls = (): void => {
        formElement.style.display = "none";
        statusElement.style.display = "none";
        hideOldMessages();
    };

    const updateMenuButton = (): void => {
        toggleButton.textContent = menuOpen ? "✕" : "💬";
        toggleButton.title = menuOpen ? "Close Chat" : "Toggle Chat";
        updateToggleVisuals();
    };

    const setMenuOpen = (open: boolean): void => {
        if (menuOpen === open) {
            return;
        }
        menuOpen = open;
        if (menuOpen) {
            attachEscapeListener();
            showControls();
        } else {
            detachEscapeListener();
            hideControls();
        }
        updateMenuButton();
    };

    const onEscapeKeyDown = (event: KeyboardEvent): void => {
        if (event.defaultPrevented) {
            return;
        }
        if (event.key !== "Escape" && event.key !== "Esc") {
            return;
        }
        if (!menuOpen) {
            return;
        }
        setMenuOpen(false);
    };

    const onScopeChange = (): void => {
        chatScope = scopeElement.value === "global" ? "global" : "team";
        updatePlaceholder();
        focusInput();
    };

    const onInputKeyDown = (event: KeyboardEvent): void => {
        event.stopPropagation();
        if (event.key === "Escape") {
            event.preventDefault();
            setMenuOpen(false);
            return;
        }
        if (event.key !== "Enter") {
            return;
        }
        event.preventDefault();
        const rateLimitUntil = state.chat.rateLimitedUntil;
        if (rateLimitUntil && rateLimitUntil > Date.now()) {
            const seconds = Math.max(1, Math.ceil((rateLimitUntil - Date.now()) / 1000));
            showStatus(`${resolveScopeLabel(chatScope)} chat cooling down (${seconds}s)`);
            return;
        }
        const sent = maybeSendChat(send, inputElement.value, chatScope);
        if (sent) {
            inputElement.value = "";
            showStatus("");
        }
    };

    const onFormSubmit = (event: SubmitEvent): void => {
        event.preventDefault();
        const rateLimitUntil = state.chat.rateLimitedUntil;
        if (rateLimitUntil && rateLimitUntil > Date.now()) {
            const seconds = Math.max(1, Math.ceil((rateLimitUntil - Date.now()) / 1000));
            showStatus(`${resolveScopeLabel(chatScope)} chat cooling down (${seconds}s)`);
            return;
        }
        const sent = maybeSendChat(send, inputElement.value, chatScope);
        if (sent) {
            inputElement.value = "";
            showStatus("");
        }
    };

    const onScopeKeyDown = (event: KeyboardEvent): void => {
        event.stopPropagation();
    };

    const onInputClick = (event: MouseEvent): void => {
        event.stopPropagation();
    };

    const onToggleMouseEnter = (): void => {
        hovered = true;
        updateToggleVisuals();
        toggleButton.style.transform = "scale(1.05)";
    };

    const onToggleMouseLeave = (): void => {
        hovered = false;
        updateToggleVisuals();
        toggleButton.style.transform = "scale(1)";
    };

    const onToggleClick = (): void => {
        setMenuOpen(!menuOpen);
    };

    scopeElement.value = chatScope;
    updatePlaceholder();
    hideControls();
    updateMenuButton();
    renderHistory();

    scopeElement.addEventListener("change", onScopeChange);
    scopeElement.addEventListener("keydown", onScopeKeyDown);
    inputElement.addEventListener("keydown", onInputKeyDown);
    inputElement.addEventListener("click", onInputClick);
    formElement.addEventListener("submit", onFormSubmit);
    toggleButton.addEventListener("mouseenter", onToggleMouseEnter);
    toggleButton.addEventListener("mouseleave", onToggleMouseLeave);
    toggleButton.addEventListener("click", onToggleClick);

    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            const hiddenByModal = state.ui.showOptionsModal || state.ui.showIntroModal;
            container.style.display = hiddenByModal ? "none" : "flex";
            toggleButton.style.display = hiddenByModal ? "none" : "flex";

            container.style.opacity = String(state.ui.overlaysOpacity);
            toggleButton.style.opacity = String(state.ui.overlaysOpacity);

            const historySignature = buildHistorySignature(state);
            if (dirty.shouldRender("chat.history", historySignature)) {
                renderHistory();
            }

            const rateLimitUntil = state.chat.rateLimitedUntil;
            if (rateLimitUntil !== lastRateLimitUntil) {
                lastRateLimitUntil = rateLimitUntil;
                if (rateLimitUntil && rateLimitUntil > Date.now()) {
                    const seconds = Math.max(1, Math.ceil((rateLimitUntil - Date.now()) / 1000));
                    showStatus(`${resolveScopeLabel(chatScope)} chat cooling down (${seconds}s)`);
                }
            }
        },
        dispose: () => {
            stopCleanup();
            if (typeof window !== "undefined" && statusTimeout !== null) {
                window.clearTimeout(statusTimeout);
            }
            detachEscapeListener();
            dirty.clear();
            scopeElement.removeEventListener("change", onScopeChange);
            scopeElement.removeEventListener("keydown", onScopeKeyDown);
            inputElement.removeEventListener("keydown", onInputKeyDown);
            inputElement.removeEventListener("click", onInputClick);
            formElement.removeEventListener("submit", onFormSubmit);
            toggleButton.removeEventListener("mouseenter", onToggleMouseEnter);
            toggleButton.removeEventListener("mouseleave", onToggleMouseLeave);
            toggleButton.removeEventListener("click", onToggleClick);
            container.remove();
            toggleButton.remove();
        }
    };
};

import type { EventSender } from "../../network/events.js";
import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";
import {
    buildHistorySignature,
    hideOldChatMessages,
    renderChatHistory,
    resolveScopeLabel,
    showAllChatMessages,
    type ChatScope
} from "./chat-history.js";
import { createChatContainer, createChatToggle, queryChatDomRefs, type ChatDomRefs } from "./chat-dom.js";
import { parseChatDraft } from "./chat-lines.js";
import { ensureChatStyles } from "./chat-styles.js";

const CHAT_CONTAINER_ID = "battlecity-chat-container";
const CHAT_TOGGLE_ID = "battlecity-chat-toggle";
const STATUS_TIMEOUT_MS = 3500;
const MESSAGE_HIDE_MS = 10000;

export { parseChatDraft, buildChatLines } from "./chat-lines.js";

type ChatManager = {
    render: () => void;
    dispose: () => void;
};

type ChatRuntimeContext = {
    state: ClientState;
    send: EventSender;
    container: HTMLElement;
    toggleButton: HTMLButtonElement;
    logElement: HTMLElement;
    formElement: HTMLFormElement;
    inputElement: HTMLInputElement;
    scopeElement: HTMLSelectElement;
    statusElement: HTMLElement;
    menuOpen: boolean;
    chatAlertActive: boolean;
    hovered: boolean;
    cleanupInterval: number | null;
    statusTimeout: number | null;
    lastRateLimitUntil: number | null;
    chatScope: ChatScope;
    messageTimestamps: Map<string, number>;
    dirty: ReturnType<typeof createDirtyFlagTracker>;
};

type ChatRuntimeHandlers = {
    onEscapeKeyDown: (event: KeyboardEvent) => void;
    onScopeChange: () => void;
    onInputKeyDown: (event: KeyboardEvent) => void;
    onFormSubmit: (event: SubmitEvent) => void;
    onScopeKeyDown: (event: KeyboardEvent) => void;
    onInputClick: (event: MouseEvent) => void;
    onToggleMouseEnter: () => void;
    onToggleMouseLeave: () => void;
    onToggleClick: () => void;
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

const createChatRuntimeContext = (
    state: ClientState,
    send: EventSender,
    refs: ChatDomRefs
): ChatRuntimeContext => {
    return {
        state,
        send,
        container: refs.container,
        toggleButton: refs.toggleButton,
        logElement: refs.logElement,
        formElement: refs.formElement,
        inputElement: refs.inputElement,
        scopeElement: refs.scopeElement,
        statusElement: refs.statusElement,
        menuOpen: false,
        chatAlertActive: false,
        hovered: false,
        cleanupInterval: null,
        statusTimeout: null,
        lastRateLimitUntil: null,
        chatScope: "team",
        messageTimestamps: new Map<string, number>(),
        dirty: createDirtyFlagTracker()
    };
};

const updateToggleVisuals = (context: ChatRuntimeContext): void => {
    if (context.chatAlertActive) {
        context.toggleButton.style.background = context.hovered ? "rgba(255, 221, 160, 0.98)" : "rgba(255, 213, 128, 0.95)";
        context.toggleButton.style.border = "1px solid rgba(255, 186, 99, 0.9)";
        context.toggleButton.style.color = "#0a1220";
        context.toggleButton.style.boxShadow = "0 10px 22px rgba(0, 0, 0, 0.6)";
        return;
    }
    context.toggleButton.style.background = context.hovered ? "rgba(15, 28, 72, 0.92)" : "rgba(10, 18, 52, 0.82)";
    context.toggleButton.style.border = "1px solid rgba(123, 152, 255, 0.35)";
    context.toggleButton.style.color = "#f0f6ff";
    context.toggleButton.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.45)";
};

const clearChatAlert = (context: ChatRuntimeContext): void => {
    if (!context.chatAlertActive) {
        return;
    }
    context.chatAlertActive = false;
    updateToggleVisuals(context);
    context.toggleButton.title = context.menuOpen ? "Close Chat" : "Toggle Chat";
};

const showChatAlert = (context: ChatRuntimeContext): void => {
    if (context.menuOpen) {
        return;
    }
    context.chatAlertActive = true;
    updateToggleVisuals(context);
    context.toggleButton.title = "New chat messages - open chat";
};

const updateMenuButton = (context: ChatRuntimeContext): void => {
    context.toggleButton.textContent = context.menuOpen ? "✕" : "💬";
    context.toggleButton.title = context.menuOpen ? "Close Chat" : "Toggle Chat";
    updateToggleVisuals(context);
};

const updatePlaceholder = (context: ChatRuntimeContext): void => {
    const scopeLabel = resolveScopeLabel(context.chatScope);
    context.inputElement.placeholder = `${scopeLabel} chat...`;
};

const focusInput = (context: ChatRuntimeContext): void => {
    if (typeof window === "undefined") {
        return;
    }
    window.requestAnimationFrame(() => {
        context.inputElement.focus();
    });
};

const clearStatusTimeout = (context: ChatRuntimeContext): void => {
    if (typeof window === "undefined" || context.statusTimeout === null) {
        return;
    }
    window.clearTimeout(context.statusTimeout);
    context.statusTimeout = null;
};

const hideStatus = (context: ChatRuntimeContext): void => {
    context.statusElement.dataset.visible = "false";
    context.statusElement.textContent = "";
};

const showStatus = (context: ChatRuntimeContext, message: string): void => {
    context.statusElement.textContent = message;
    if (message.length <= 0) {
        hideStatus(context);
        return;
    }
    context.statusElement.dataset.visible = "true";
    if (typeof window === "undefined") {
        return;
    }
    clearStatusTimeout(context);
    context.statusTimeout = window.setTimeout(() => {
        hideStatus(context);
    }, STATUS_TIMEOUT_MS);
};

const startCleanup = (context: ChatRuntimeContext): void => {
    if (context.cleanupInterval !== null || typeof window === "undefined") {
        return;
    }
    context.cleanupInterval = window.setInterval(() => {
        if (!context.menuOpen) {
            hideOldChatMessages(context.logElement, MESSAGE_HIDE_MS);
        }
    }, 1000);
};

const stopCleanup = (context: ChatRuntimeContext): void => {
    if (context.cleanupInterval === null || typeof window === "undefined") {
        return;
    }
    window.clearInterval(context.cleanupInterval);
    context.cleanupInterval = null;
};

const attachEscapeListener = (handler: (event: KeyboardEvent) => void): void => {
    document.addEventListener("keydown", handler);
};

const detachEscapeListener = (handler: (event: KeyboardEvent) => void): void => {
    document.removeEventListener("keydown", handler);
};

const showControls = (context: ChatRuntimeContext): void => {
    context.formElement.style.display = "flex";
    context.statusElement.style.display = "block";
    showAllChatMessages(context.logElement);
    clearChatAlert(context);
    focusInput(context);
};

const hideControls = (context: ChatRuntimeContext): void => {
    context.formElement.style.display = "none";
    context.statusElement.style.display = "none";
    hideOldChatMessages(context.logElement, MESSAGE_HIDE_MS);
};

const setMenuOpen = (
    context: ChatRuntimeContext,
    open: boolean,
    escapeHandler: (event: KeyboardEvent) => void
): void => {
    if (context.menuOpen === open) {
        return;
    }
    context.menuOpen = open;
    if (context.menuOpen) {
        attachEscapeListener(escapeHandler);
        showControls(context);
    } else {
        detachEscapeListener(escapeHandler);
        hideControls(context);
    }
    updateMenuButton(context);
};

const showRateLimitStatus = (context: ChatRuntimeContext): void => {
    const rateLimitUntil = context.state.chat.rateLimitedUntil;
    if (!rateLimitUntil || rateLimitUntil <= Date.now()) {
        return;
    }
    const seconds = Math.max(1, Math.ceil((rateLimitUntil - Date.now()) / 1000));
    showStatus(context, `${resolveScopeLabel(context.chatScope)} chat cooling down (${seconds}s)`);
};

const trySendDraft = (context: ChatRuntimeContext): void => {
    const rateLimitUntil = context.state.chat.rateLimitedUntil;
    if (rateLimitUntil && rateLimitUntil > Date.now()) {
        showRateLimitStatus(context);
        return;
    }
    const sent = maybeSendChat(context.send, context.inputElement.value, context.chatScope);
    if (!sent) {
        return;
    }
    context.inputElement.value = "";
    showStatus(context, "");
};

const toggleChatHover = (context: ChatRuntimeContext, hovered: boolean): void => {
    context.hovered = hovered;
    updateToggleVisuals(context);
    context.toggleButton.style.transform = hovered ? "scale(1.05)" : "scale(1)";
};

const handleEscapeKeyDown = (
    context: ChatRuntimeContext,
    event: KeyboardEvent,
    escapeHandler: (event: KeyboardEvent) => void
): void => {
    if (event.defaultPrevented) {
        return;
    }
    if (event.key !== "Escape" && event.key !== "Esc") {
        return;
    }
    if (!context.menuOpen) {
        return;
    }
    setMenuOpen(context, false, escapeHandler);
};

const handleScopeChange = (context: ChatRuntimeContext): void => {
    context.chatScope = context.scopeElement.value === "global" ? "global" : "team";
    updatePlaceholder(context);
    focusInput(context);
};

const handleInputKeyDown = (
    context: ChatRuntimeContext,
    event: KeyboardEvent,
    escapeHandler: (event: KeyboardEvent) => void
): void => {
    event.stopPropagation();
    if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(context, false, escapeHandler);
        return;
    }
    if (event.key !== "Enter") {
        return;
    }
    event.preventDefault();
    trySendDraft(context);
};

const handleFormSubmit = (
    context: ChatRuntimeContext,
    event: SubmitEvent
): void => {
    event.preventDefault();
    trySendDraft(context);
};

const stopKeyboardPropagation = (event: KeyboardEvent): void => {
    event.stopPropagation();
};

const stopMousePropagation = (event: MouseEvent): void => {
    event.stopPropagation();
};

const updateChatRateLimitStatus = (context: ChatRuntimeContext): void => {
    const rateLimitUntil = context.state.chat.rateLimitedUntil;
    if (rateLimitUntil === context.lastRateLimitUntil) {
        return;
    }
    context.lastRateLimitUntil = rateLimitUntil;
    if (!rateLimitUntil || rateLimitUntil <= Date.now()) {
        return;
    }
    showRateLimitStatus(context);
};

const renderChatRuntime = (context: ChatRuntimeContext): void => {
    const hiddenByModal = context.state.ui.showOptionsModal || context.state.ui.showIntroModal;
    context.container.style.display = hiddenByModal ? "none" : "flex";
    context.toggleButton.style.display = hiddenByModal ? "none" : "flex";

    context.container.style.opacity = String(context.state.ui.overlaysOpacity);
    context.toggleButton.style.opacity = String(context.state.ui.overlaysOpacity);

    const historySignature = buildHistorySignature(context.state);
    if (context.dirty.shouldRender("chat.history", historySignature)) {
        renderChatHistory({
            state: context.state,
            logElement: context.logElement,
            menuOpen: context.menuOpen,
            messageTimestamps: context.messageTimestamps,
            messageHideMs: MESSAGE_HIDE_MS,
            onNewMessageWhileClosed: () => {
                showChatAlert(context);
            }
        });
        startCleanup(context);
    }
    updateChatRateLimitStatus(context);
};

const attachChatListeners = (
    context: ChatRuntimeContext,
    handlers: ChatRuntimeHandlers
): void => {
    context.scopeElement.addEventListener("change", handlers.onScopeChange);
    context.scopeElement.addEventListener("keydown", handlers.onScopeKeyDown);
    context.inputElement.addEventListener("keydown", handlers.onInputKeyDown);
    context.inputElement.addEventListener("click", handlers.onInputClick);
    context.formElement.addEventListener("submit", handlers.onFormSubmit);
    context.toggleButton.addEventListener("mouseenter", handlers.onToggleMouseEnter);
    context.toggleButton.addEventListener("mouseleave", handlers.onToggleMouseLeave);
    context.toggleButton.addEventListener("click", handlers.onToggleClick);
};

const detachChatListeners = (
    context: ChatRuntimeContext,
    handlers: ChatRuntimeHandlers
): void => {
    context.scopeElement.removeEventListener("change", handlers.onScopeChange);
    context.scopeElement.removeEventListener("keydown", handlers.onScopeKeyDown);
    context.inputElement.removeEventListener("keydown", handlers.onInputKeyDown);
    context.inputElement.removeEventListener("click", handlers.onInputClick);
    context.formElement.removeEventListener("submit", handlers.onFormSubmit);
    context.toggleButton.removeEventListener("mouseenter", handlers.onToggleMouseEnter);
    context.toggleButton.removeEventListener("mouseleave", handlers.onToggleMouseLeave);
    context.toggleButton.removeEventListener("click", handlers.onToggleClick);
};

const initializeChatRuntime = (context: ChatRuntimeContext): void => {
    context.scopeElement.value = context.chatScope;
    updatePlaceholder(context);
    hideControls(context);
    updateMenuButton(context);
    renderChatHistory({
        state: context.state,
        logElement: context.logElement,
        menuOpen: context.menuOpen,
        messageTimestamps: context.messageTimestamps,
        messageHideMs: MESSAGE_HIDE_MS,
        onNewMessageWhileClosed: () => {
            showChatAlert(context);
        }
    });
    startCleanup(context);
};

const disposeChatRuntime = (
    context: ChatRuntimeContext,
    handlers: ChatRuntimeHandlers
): void => {
    stopCleanup(context);
    clearStatusTimeout(context);
    detachEscapeListener(handlers.onEscapeKeyDown);
    detachChatListeners(context, handlers);
    context.dirty.clear();
    context.container.remove();
    context.toggleButton.remove();
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

    ensureChatStyles(CHAT_CONTAINER_ID, CHAT_TOGGLE_ID);
    const container = createChatContainer(root, CHAT_CONTAINER_ID);
    const toggleButton = createChatToggle(root, CHAT_TOGGLE_ID);
    const domRefs = queryChatDomRefs(container, toggleButton);
    if (!domRefs) {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const context = createChatRuntimeContext(state, send, domRefs);
    const handlers: ChatRuntimeHandlers = {
        onEscapeKeyDown: (event) => {
            handleEscapeKeyDown(context, event, handlers.onEscapeKeyDown);
        },
        onScopeChange: () => {
            handleScopeChange(context);
        },
        onInputKeyDown: (event) => {
            handleInputKeyDown(context, event, handlers.onEscapeKeyDown);
        },
        onFormSubmit: (event) => {
            handleFormSubmit(context, event);
        },
        onScopeKeyDown: stopKeyboardPropagation,
        onInputClick: stopMousePropagation,
        onToggleMouseEnter: () => {
            toggleChatHover(context, true);
        },
        onToggleMouseLeave: () => {
            toggleChatHover(context, false);
        },
        onToggleClick: () => {
            setMenuOpen(context, !context.menuOpen, handlers.onEscapeKeyDown);
        }
    };

    initializeChatRuntime(context);
    attachChatListeners(context, handlers);

    return {
        render: () => {
            renderChatRuntime(context);
        },
        dispose: () => {
            disposeChatRuntime(context, handlers);
        }
    };
};

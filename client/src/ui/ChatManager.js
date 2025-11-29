import { getCityDisplayName } from '../utils/citySpawns';

const CHAT_CONTAINER_ID = 'battlecity-chat-container';
const MAX_MESSAGES = 100;
const SCOPE_LABELS = {
    team: 'Team',
    global: 'Global'
};
const STATUS_TIMEOUT_MS = 3500;

const toFiniteNumber = (value, fallback = null) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (value, fallback = null) => {
    const numeric = toFiniteNumber(value, fallback);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
};

const formatTimestamp = (timestamp) => {
    if (!Number.isFinite(timestamp)) {
        return '';
    }
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

class ChatManager {
    constructor(options = {}) {
        this.game = options.game ?? null;
        this.defaultScope = options.defaultScope === 'global' ? 'global' : 'team';
        this.maxMessages = Number.isFinite(options.maxMessages) ? Math.max(1, options.maxMessages) : MAX_MESSAGES;
        this.messages = [];
        this.socket = null;
        this.scope = this.defaultScope;
        this.statusTimeout = null;

        this.handleIncomingMessage = (payload) => this.receiveMessage(payload);
        this.handleHistory = (payload) => this.applyHistory(payload);
        this.handleRateLimit = (payload) => this.receiveRateLimit(payload);
        this.handleConnected = () => this.setConnectionState(true);
        this.handleDisconnected = () => this.setConnectionState(false);

        this.injectStyles();
        this.container = this.ensureContainer();
        this.logElement = this.container ? this.container.querySelector('.battlecity-chat__log') : null;
        this.formElement = this.container ? this.container.querySelector('.battlecity-chat__form') : null;
        this.inputElement = this.container ? this.container.querySelector('.battlecity-chat__input') : null;
        this.scopeElement = this.container ? this.container.querySelector('.battlecity-chat__scope') : null;
        this.statusElement = this.container ? this.container.querySelector('.battlecity-chat__status') : null;

        this.registerDomEvents();
        this.setConnectionState(false);
        this.hideControls(); // Start with controls hidden
    }

    injectStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('battlecity-chat-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'battlecity-chat-styles';
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
        `;
        document.head.appendChild(style);
    }

    ensureContainer() {
        if (typeof document === 'undefined') {
            return null;
        }
        let container = document.getElementById(CHAT_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = CHAT_CONTAINER_ID;
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
            const gameContainer = document.getElementById('game');
            if (gameContainer) {
                gameContainer.appendChild(container);
            } else {
                document.body.appendChild(container);
            }
        }
        return container;
    }

    registerDomEvents() {
        if (!this.formElement || !this.inputElement || !this.scopeElement) {
            return;
        }
        this.scopeElement.value = this.scope;
        this.scopeElement.addEventListener('change', () => {
            this.scope = this.scopeElement.value === 'global' ? 'global' : 'team';
            this.updatePlaceholder();
            this.focusInput();
        });
        this.formElement.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitMessage();
        });
    }

    bindSocket(socket) {
        if (this.socket) {
            this.socket.off('chat:message', this.handleIncomingMessage);
            this.socket.off('chat:history', this.handleHistory);
            this.socket.off('chat:rate_limit', this.handleRateLimit);
            this.socket.off('connected', this.handleConnected);
            this.socket.off('disconnected', this.handleDisconnected);
        }
        this.socket = socket;
        if (!socket) {
            return;
        }
        socket.on('chat:message', this.handleIncomingMessage);
        socket.on('chat:history', this.handleHistory);
        socket.on('chat:rate_limit', this.handleRateLimit);
        socket.on('connected', this.handleConnected);
        socket.on('disconnected', this.handleDisconnected);
    }

    setConnectionState(isConnected) {
        if (!this.container) {
            return;
        }
        this.container.dataset.connected = isConnected ? 'true' : 'false';
        if (!this.inputElement) {
            return;
        }
        this.inputElement.disabled = !isConnected;
        if (this.scopeElement) {
            this.scopeElement.disabled = !isConnected;
        }
        this.updatePlaceholder();
    }

    updatePlaceholder() {
        if (!this.inputElement) {
            return;
        }
        const scopeLabel = SCOPE_LABELS[this.scope] || SCOPE_LABELS.team;
        const status = this.container?.dataset.connected === 'true'
            ? `${scopeLabel} chat…`
            : 'Chat offline';
        this.inputElement.placeholder = status;
    }

    submitMessage() {
        if (!this.socket || !this.inputElement) {
            return;
        }
        const value = this.inputElement.value;
        if (!value || !value.trim()) {
            this.inputElement.value = '';
            return;
        }
        const sent = this.socket.sendChatMessage({
            scope: this.scope,
            message: value
        });
        if (sent) {
            this.inputElement.value = '';
        }
    }

    focusInput() {
        if (!this.inputElement || typeof window === 'undefined') {
            return;
        }
        window.requestAnimationFrame(() => {
            if (this.inputElement) {
                this.inputElement.focus();
            }
        });
    }

    receiveMessage(payload) {
        const normalised = this.normaliseIncomingMessage(payload);
        if (!normalised) {
            return;
        }
        this.messages.push(normalised);
        if (this.messages.length > this.maxMessages) {
            this.messages.splice(0, this.messages.length - this.maxMessages);
        }
        this.appendMessage(normalised);
        if (this.game && typeof this.game.showChatAlert === 'function') {
            if (this.game.menuOpen && typeof this.game.clearChatAlert === 'function') {
                this.game.clearChatAlert();
            } else if (!this.game.menuOpen) {
                this.game.showChatAlert();
            }
        }
    }

    applyHistory(history) {
        if (!Array.isArray(history)) {
            return;
        }
        this.messages = history
            .map((entry) => this.normaliseIncomingMessage(entry))
            .filter(Boolean);
        if (!this.logElement) {
            return;
        }
        this.logElement.innerHTML = '';
        this.messages.forEach((message) => {
            this.logElement.appendChild(this.renderMessage(message));
        });
        this.scrollToBottom();
    }

    normaliseIncomingMessage(payload) {
        if (!payload) {
            return null;
        }
        const scope = (typeof payload.scope === 'string' && payload.scope.toLowerCase() === 'global')
            ? 'global'
            : 'team';
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (!text) {
            return null;
        }
        const createdAt = toFiniteNumber(payload.createdAt, Date.now());
        const senderId = payload.senderId ?? null;
        const senderCity = normaliseCityId(payload.senderCity, null);
        const senderLabel = this.resolveSenderLabel(payload, senderCity);
        const id = payload.id ? String(payload.id) : `${createdAt}-${Math.random().toString(36).slice(2, 6)}`;
        return {
            id,
            scope,
            text,
            createdAt,
            senderId,
            senderCity,
            senderLabel
        };
    }

    resolveSenderLabel(payload, cityId) {
        if (payload && typeof payload.senderDisplay === 'string' && payload.senderDisplay.trim().length) {
            return payload.senderDisplay.trim();
        }
        if (payload && typeof payload.senderCallsign === 'string' && payload.senderCallsign.trim().length) {
            return payload.senderCallsign.trim();
        }
        if (this.game && typeof this.game.resolveCallsign === 'function' && payload?.senderId) {
            const resolved = this.game.resolveCallsign(payload.senderId);
            if (resolved) {
                return resolved;
            }
        }
        const cityName = this.resolveCityName(cityId);
        if (payload?.senderId) {
            const id = String(payload.senderId);
            if (id.length <= 8) {
                return id;
            }
            return `${id.slice(0, 4)}…${id.slice(-2)}`;
        }
        return cityName || 'Player';
    }

    resolveCityName(cityId) {
        if (cityId === null || cityId === undefined) {
            return null;
        }
        if (this.game && Array.isArray(this.game.cities)) {
            const city = this.game.cities[cityId];
            if (city) {
                if (typeof city.nameOverride === 'string' && city.nameOverride.trim().length) {
                    return city.nameOverride.trim();
                }
                if (typeof city.name === 'string' && city.name.trim().length) {
                    return city.name.trim();
                }
            }
        }
        return getCityDisplayName(cityId);
    }

    appendMessage(message) {
        if (!this.logElement) {
            return;
        }
        const node = this.renderMessage(message);
        node.dataset.timestamp = Date.now(); // Add timestamp for auto-hide
        this.logElement.appendChild(node);
        this.scrollToBottom();
        this.startMessageCleanup();
    }

    renderMessage(message) {
        const element = document.createElement('div');
        element.className = 'battlecity-chat__message';
        element.dataset.scope = message.scope;

        const header = document.createElement('div');
        header.className = 'battlecity-chat__messageHeader';

        const scopeBadge = document.createElement('span');
        scopeBadge.className = 'battlecity-chat__scopeBadge';
        scopeBadge.dataset.scope = message.scope;
        scopeBadge.textContent = SCOPE_LABELS[message.scope] || SCOPE_LABELS.team;
        header.appendChild(scopeBadge);

        if (message.senderCity !== null && message.senderCity !== undefined) {
            const city = document.createElement('span');
            city.className = 'battlecity-chat__city';
            city.textContent = this.resolveCityName(message.senderCity);
            header.appendChild(city);
        }

        const sender = document.createElement('span');
        sender.className = 'battlecity-chat__sender';
        sender.textContent = message.senderLabel;
        header.appendChild(sender);

        const time = formatTimestamp(message.createdAt);
        if (time) {
            const timeElement = document.createElement('span');
            timeElement.className = 'battlecity-chat__time';
            timeElement.textContent = time;
            header.appendChild(timeElement);
        }

        const body = document.createElement('div');
        body.className = 'battlecity-chat__body';
        body.textContent = message.text;

        element.appendChild(header);
        element.appendChild(body);
        return element;
    }

    scrollToBottom() {
        if (!this.logElement) {
            return;
        }
        this.logElement.scrollTop = this.logElement.scrollHeight;
    }

    receiveRateLimit(payload) {
        if (!payload) {
            return;
        }
        const scope = payload.scope === 'global' ? 'global' : 'team';
        const label = SCOPE_LABELS[scope] || SCOPE_LABELS.team;
        const retryAt = toFiniteNumber(payload.retryAt, Date.now());
        const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
        const message = `${label} chat cooling down (${seconds}s)`;
        this.showStatus(message);
        if (this.game && typeof this.game.notify === 'function') {
            this.game.notify({
                title: 'Chat Rate Limit',
                message,
                variant: 'warn',
                timeout: 2400
            });
        }
    }

    showStatus(message) {
        if (!this.statusElement) {
            return;
        }
        this.statusElement.textContent = message || '';
        if (message) {
            this.statusElement.dataset.visible = 'true';
            if (typeof window !== 'undefined') {
                if (this.statusTimeout) {
                    window.clearTimeout(this.statusTimeout);
                }
                this.statusTimeout = window.setTimeout(() => {
                    if (this.statusElement) {
                        this.statusElement.dataset.visible = 'false';
                        this.statusElement.textContent = '';
                    }
                }, STATUS_TIMEOUT_MS);
            }
        } else {
            this.statusElement.dataset.visible = 'false';
        }
    }

    showControls() {
        if (this.formElement) {
            this.formElement.style.display = 'flex';
        }
        if (this.statusElement) {
            this.statusElement.style.display = 'block';
        }
        if (this.logElement) {
            this.logElement.style.display = 'flex'; // Always show log when menu is open
        }
        this.showAllMessages(); // Show all messages when menu opens
        if (this.game && typeof this.game.clearChatAlert === 'function') {
            this.game.clearChatAlert();
        }
    }

    hideControls() {
        if (this.formElement) {
            this.formElement.style.display = 'none';
        }
        if (this.statusElement) {
            this.statusElement.style.display = 'none';
        }
        this.hideOldMessages();
    }

    showAllMessages() {
        if (!this.logElement) {
            return;
        }
        const messages = this.logElement.querySelectorAll('.battlecity-chat__message');
        messages.forEach(msg => {
            msg.style.display = 'flex';
        });
    }

    hideOldMessages() {
        if (!this.logElement) {
            return;
        }
        const now = Date.now();
        const messages = this.logElement.querySelectorAll('.battlecity-chat__message');
        let hasVisibleMessages = false;

        messages.forEach(msg => {
            const timestamp = parseInt(msg.dataset.timestamp, 10);
            if (timestamp && (now - timestamp > 10000)) { // 10 seconds
                msg.style.display = 'none';
            } else {
                msg.style.display = 'flex';
                hasVisibleMessages = true;
            }
        });

        // Hide the log container itself if there are no visible messages
        if (!hasVisibleMessages) {
            this.logElement.style.display = 'none';
        } else {
            this.logElement.style.display = 'flex';
        }
    }

    startMessageCleanup() {
        if (this.cleanupInterval) {
            return; // Already running
        }
        this.cleanupInterval = setInterval(() => {
            // Only hide old messages if menu is closed (controls are hidden)
            if (this.formElement && this.formElement.style.display === 'none') {
                this.hideOldMessages();
            }
        }, 1000); // Check every second
    }

    stopMessageCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

export default ChatManager;

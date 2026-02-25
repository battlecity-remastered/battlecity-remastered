export type ChatDomRefs = {
    container: HTMLElement;
    toggleButton: HTMLButtonElement;
    logElement: HTMLElement;
    formElement: HTMLFormElement;
    inputElement: HTMLInputElement;
    scopeElement: HTMLSelectElement;
    statusElement: HTMLElement;
};

export const createChatContainer = (root: HTMLElement, containerId: string): HTMLElement => {
    const existing = document.getElementById(containerId);
    if (existing) {
        return existing;
    }
    const container = document.createElement("div");
    container.id = containerId;
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

export const createChatToggle = (root: HTMLElement, toggleId: string): HTMLButtonElement => {
    const existing = document.getElementById(toggleId);
    if (existing instanceof HTMLButtonElement) {
        return existing;
    }
    const button = document.createElement("button");
    button.id = toggleId;
    button.type = "button";
    button.textContent = "💬";
    button.title = "Toggle Chat";
    root.appendChild(button);
    return button;
};

export const queryChatDomRefs = (container: HTMLElement, toggleButton: HTMLButtonElement): ChatDomRefs | null => {
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
        return null;
    }
    return {
        container,
        toggleButton,
        logElement,
        formElement,
        inputElement,
        scopeElement,
        statusElement
    };
};

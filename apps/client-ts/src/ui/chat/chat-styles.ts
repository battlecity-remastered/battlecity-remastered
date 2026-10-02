import { chatCss } from "./chat-css.js";
const CHAT_CSS_TEMPLATE = (containerId: string, toggleId: string): string => chatCss.replaceAll("__CONTAINER_ID__", containerId).replaceAll("__TOGGLE_ID__", toggleId);

export const ensureChatStyles = (containerId: string, toggleId: string): void => {
    if (typeof document === "undefined") {
        return;
    }
    const styleId = `${containerId}-styles`;
    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = CHAT_CSS_TEMPLATE(containerId, toggleId);
    document.head.appendChild(style);
};

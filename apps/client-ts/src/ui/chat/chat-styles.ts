const CHAT_CSS_TEMPLATE = (containerId: string, toggleId: string): string => `
        #${containerId} {
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
        #${containerId}[data-connected="false"] .battlecity-chat__input,
        #${containerId}[data-connected="false"] .battlecity-chat__scope {
            opacity: 0.55;
        }
        #${containerId} .battlecity-chat__log {
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
        #${containerId} .battlecity-chat__message {
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 13px;
            line-height: 1.45;
            word-break: break-word;
        }
        #${containerId} .battlecity-chat__messageHeader {
            display: flex;
            gap: 6px;
            align-items: baseline;
            font-size: 12px;
            letter-spacing: 0.2px;
            opacity: 0.8;
        }
        #${containerId} .battlecity-chat__scopeBadge {
            text-transform: uppercase;
            font-weight: 600;
            color: #8fb5ff;
        }
        #${containerId} .battlecity-chat__scopeBadge[data-scope="global"] {
            color: #ffba6b;
        }
        #${containerId} .battlecity-chat__sender {
            font-weight: 600;
            color: #f0f4ff;
        }
        #${containerId} .battlecity-chat__body {
            font-size: 13px;
            letter-spacing: 0.2px;
        }
        #${containerId} .battlecity-chat__form {
            display: flex;
            gap: 6px;
            pointer-events: auto;
        }
        #${containerId} .battlecity-chat__scope {
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
        #${containerId} .battlecity-chat__input {
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
        #${containerId} .battlecity-chat__input::placeholder {
            color: rgba(205, 214, 255, 0.65);
        }
        #${containerId} .battlecity-chat__status {
            min-height: 16px;
            font-size: 12px;
            color: #ffd27d;
            letter-spacing: 0.2px;
            opacity: 0;
            transition: opacity 180ms ease;
            pointer-events: none;
        }
        #${containerId} .battlecity-chat__status[data-visible="true"] {
            opacity: 0.85;
        }
        #${toggleId} {
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

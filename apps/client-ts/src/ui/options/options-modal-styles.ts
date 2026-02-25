const OPTIONS_STYLE_ID = "battlecity-options-styles";

const OPTIONS_MODAL_CSS = `
        .battlecity-options-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 15000;
            padding: 24px;
        }
        .battlecity-options-panel {
            width: min(620px, 100%);
            max-height: calc(100vh - 40px);
            background: linear-gradient(150deg, rgba(8, 12, 26, 0.96) 0%, rgba(14, 22, 50, 0.94) 55%, rgba(12, 33, 68, 0.9) 100%);
            border: 1px solid rgba(123, 182, 255, 0.45);
            box-shadow: 0 24px 56px rgba(0, 0, 0, 0.65);
            border-radius: 18px;
            padding: 26px 30px 22px;
            color: #f5f7ff;
            font-family: "Rajdhani", "Segoe UI", Tahoma, sans-serif;
            display: flex;
            flex-direction: column;
            gap: 14px;
            position: relative;
            overflow: hidden;
        }
        .battlecity-options-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
        }
        .battlecity-options-title {
            margin: 0;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .battlecity-options-badge {
            font-size: 11px;
            letter-spacing: 0.6px;
            background: rgba(255, 255, 255, 0.12);
            color: #c7ddff;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            text-transform: uppercase;
        }
        .battlecity-options-close,
        .battlecity-options-action,
        .battlecity-options-reveal {
            border: none;
            background: linear-gradient(135deg, rgba(110, 179, 255, 0.9), rgba(83, 141, 255, 0.95));
            color: #071021;
            font-size: 14px;
            padding: 10px 16px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 700;
            letter-spacing: 0.2px;
            box-shadow: 0 12px 24px rgba(47, 120, 255, 0.35);
            transition: background 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }
        .battlecity-options-close {
            background: rgba(255, 255, 255, 0.08);
            color: #f5f7ff;
            box-shadow: none;
        }
        .battlecity-options-close:hover {
            background: rgba(255, 255, 255, 0.14);
        }
        .battlecity-options-close:active {
            transform: translateY(1px);
        }
        .battlecity-options-action:hover,
        .battlecity-options-reveal:hover {
            box-shadow: 0 14px 28px rgba(68, 152, 255, 0.4);
        }
        .battlecity-options-action:active,
        .battlecity-options-reveal:active {
            transform: translateY(1px);
        }
        .battlecity-options-body {
            display: grid;
            gap: 14px;
        }
        .battlecity-options-section {
            border: 1px solid rgba(123, 182, 255, 0.32);
            border-radius: 16px;
            background: rgba(16, 24, 46, 0.75);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
            overflow: hidden;
        }
        .battlecity-options-sectionHeader {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            padding: 12px 14px 12px 16px;
            background: rgba(255, 255, 255, 0.02);
            border: none;
            color: #f5f7ff;
            cursor: pointer;
            text-align: left;
            transition: background 0.15s ease, transform 0.1s ease;
        }
        .battlecity-options-sectionHeader:hover {
            background: rgba(255, 255, 255, 0.05);
        }
        .battlecity-options-sectionHeader:active {
            transform: translateY(1px);
        }
        .battlecity-options-sectionTitle {
            margin: 0;
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.3px;
            text-transform: uppercase;
        }
        .battlecity-options-sectionSubtitle {
            display: block;
            margin-top: 2px;
            font-size: 12px;
            color: rgba(220, 232, 255, 0.85);
            letter-spacing: 0.15px;
        }
        .battlecity-options-sectionTitle span {
            display: block;
        }
        .battlecity-options-chevron {
            font-size: 18px;
            transition: transform 0.2s ease, opacity 0.2s ease;
            opacity: 0.8;
        }
        .battlecity-options-sectionHeader[aria-expanded="true"] .battlecity-options-chevron {
            transform: rotate(180deg);
        }
        .battlecity-options-sectionBody {
            display: grid;
            gap: 12px;
            padding: 0 14px 0 16px;
            max-height: 0;
            opacity: 0;
            overflow: hidden;
            pointer-events: none;
            transition: max-height 0.25s ease, opacity 0.25s ease, padding 0.25s ease;
        }
        .battlecity-options-sectionBody[data-open="true"] {
            max-height: 1100px;
            opacity: 1;
            pointer-events: auto;
            padding: 12px 14px 14px 16px;
        }
        .battlecity-options-lead {
            margin: 0;
            font-size: 14px;
            color: rgba(235, 241, 255, 0.92);
            line-height: 1.5;
        }
        .battlecity-options-steps {
            list-style: none;
            margin: 0;
            padding: 10px 12px;
            display: grid;
            gap: 6px;
            border: 1px solid rgba(123, 182, 255, 0.32);
            border-radius: 14px;
            background: rgba(16, 24, 46, 0.8);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .battlecity-options-steps li {
            font-size: 13px;
            color: rgba(230, 237, 255, 0.88);
            padding-left: 16px;
            position: relative;
        }
        .battlecity-options-steps li::before {
            content: "•";
            position: absolute;
            left: 0;
            color: #8ac2ff;
            font-weight: 700;
        }
        .battlecity-options-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            align-items: center;
        }
        .battlecity-options-form {
            display: grid;
            gap: 10px;
            align-items: stretch;
            padding: 12px 12px 2px;
            border-radius: 12px;
            border: 1px solid rgba(123, 182, 255, 0.28);
            background: rgba(11, 16, 32, 0.9);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
            max-height: 0;
            opacity: 0;
            overflow: hidden;
            pointer-events: none;
            transition: max-height 0.25s ease, opacity 0.25s ease;
        }
        .battlecity-options-form[data-open="true"] {
            max-height: 540px;
            opacity: 1;
            pointer-events: auto;
            padding-bottom: 12px;
        }
        .battlecity-options-textarea {
            width: 100%;
            min-height: 200px;
            border-radius: 12px;
            border: 1px solid rgba(145, 196, 255, 0.55);
            background: rgba(16, 22, 36, 0.92);
            color: #e9ecff;
            padding: 12px;
            font-size: 13px;
            resize: vertical;
            font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
            box-sizing: border-box;
            width: 100%;
            max-width: 100%;
        }
        .battlecity-options-helper {
            font-size: 12px;
            color: rgba(200, 210, 235, 0.9);
            line-height: 1.5;
        }
        .battlecity-options-status {
            font-size: 12px;
            color: #bcd8ff;
            min-height: 18px;
            padding: 6px 0 2px;
        }
        .battlecity-options-summary {
            margin: 0;
            white-space: pre-wrap;
            font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
            font-size: 11px;
            line-height: 1.45;
            color: rgba(216, 228, 255, 0.9);
            background: rgba(10, 16, 31, 0.75);
            border: 1px solid rgba(123, 182, 255, 0.18);
            border-radius: 12px;
            padding: 10px;
        }
    `;

export const ensureOptionsStyles = (): void => {
    if (typeof document === "undefined") {
        return;
    }
    if (document.getElementById(OPTIONS_STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = OPTIONS_STYLE_ID;
    style.textContent = OPTIONS_MODAL_CSS;
    document.head.appendChild(style);
};

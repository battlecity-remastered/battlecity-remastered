const LOBBY_STYLE_ID = "battlecity-lobby-styles";

const LOBBY_CSS = `
        .lobby-overlay-ts {
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(8, 10, 16, 0.85);
            z-index: 9999;
            pointer-events: auto;
        }
        .lobby-panel-ts {
            width: min(620px, 92vw);
            max-height: 86vh;
            background: #131722;
            border: 1px solid #2a3140;
            border-radius: 8px;
            padding: 24px 28px;
            color: #f5f7ff;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
            display: flex;
            flex-direction: column;
            gap: 20px;
            z-index: 70;
        }
        .lobby-header {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .lobby-title {
            font-size: 24px;
            font-weight: 600;
            margin: 0;
        }
        .lobby-subtitle {
            font-size: 14px;
            color: #b3b9c9;
            margin: 0;
        }
        .lobby-tabs {
            display: flex;
            gap: 8px;
            border-bottom: 1px solid rgba(53, 63, 83, 0.8);
            padding-bottom: 8px;
        }
        .lobby-tab {
            background: transparent;
            border: none;
            color: #b3b9c9;
            font-size: 14px;
            padding: 6px 12px;
            border-radius: 6px 6px 0 0;
            cursor: pointer;
            transition: background 0.2s, color 0.2s;
        }
        .lobby-tab:hover {
            color: #f5f7ff;
        }
        .lobby-tab:focus {
            outline: none;
            box-shadow: 0 0 0 2px rgba(123, 225, 125, 0.35);
        }
        .lobby-tab.active {
            background: rgba(53, 63, 83, 0.6);
            color: #f5f7ff;
            font-weight: 600;
        }
        .lobby-tab-panels {
            flex: 1;
            min-height: 0;
            display: flex;
            position: relative;
        }
        .lobby-tab-panel {
            flex: 1;
            display: none;
            flex-direction: column;
            min-height: 0;
        }
        .lobby-tab-panel.active {
            display: flex;
        }
        .lobby-city-filter {
            display: flex;
            margin-bottom: 12px;
        }
        .lobby-city-filter-input {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #384156;
            border-radius: 4px;
            background: #0f131d;
            color: #e1e6f6;
            font-size: 13px;
        }
        .lobby-city-filter-input:focus {
            outline: none;
            border-color: #5c9eff;
            box-shadow: 0 0 0 1px rgba(92, 158, 255, 0.25);
        }
        .lobby-city-list {
            flex: 1;
            overflow-y: auto;
            padding-right: 6px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 0;
        }
        .lobby-city-empty,
        .lobby-highscore-empty {
            color: #b3b9c9;
            font-size: 14px;
            text-align: center;
            padding: 24px 0;
        }
        .lobby-city-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(22, 27, 38, 0.85);
            border: 1px solid rgba(53, 63, 83, 0.8);
            border-radius: 6px;
            padding: 12px 16px;
            gap: 16px;
        }
        .lobby-city-row.waiting {
            border-color: #5c9eff;
            box-shadow: 0 0 0 1px rgba(92, 158, 255, 0.35);
        }
        .lobby-city-info {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
        }
        .lobby-city-name {
            font-size: 16px;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .lobby-city-meta {
            font-size: 13px;
            color: #9aa3b8;
        }
        .lobby-city-actions {
            display: flex;
            gap: 8px;
        }
        .lobby-highscore-list {
            flex: 1;
            overflow-y: auto;
            padding-right: 6px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-height: 0;
        }
        .lobby-highscore-row {
            display: grid;
            grid-template-columns: 44px 1fr 120px;
            align-items: center;
            background: rgba(22, 27, 38, 0.85);
            border: 1px solid rgba(53, 63, 83, 0.8);
            border-radius: 6px;
            padding: 10px 14px;
            gap: 12px;
            font-size: 14px;
        }
        .lobby-highscore-rank {
            font-weight: 600;
            color: #7be17d;
            text-align: center;
        }
        .lobby-highscore-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }
        .lobby-highscore-name {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
        .lobby-highscore-meta {
            font-size: 12px;
            color: #8d94a7;
        }
        .lobby-highscore-score {
            text-align: right;
            color: #ffc977;
            font-weight: 600;
        }
        .lobby-btn {
            background: #1f2534;
            color: #e1e6f6;
            border: 1px solid #384156;
            border-radius: 4px;
            padding: 8px 14px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s, transform 0.15s;
        }
        .lobby-btn:hover:not(:disabled) {
            background: #2a3245;
            border-color: #4f5d7c;
        }
        .lobby-btn:active:not(:disabled) {
            transform: translateY(1px);
        }
        .lobby-btn:disabled {
            opacity: 0.45;
            cursor: default;
        }
        .lobby-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        .lobby-action-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .lobby-status {
            font-size: 13px;
            color: #b3b9c9;
            min-height: 18px;
        }
        .lobby-status[data-type="error"] {
            color: #ff8080;
        }
        .lobby-status[data-type="warn"] {
            color: #ffc977;
        }
        .lobby-status[data-type="success"] {
            color: #7be17d;
        }
    `;

export const ensureLobbyStyles = (): void => {
    if (typeof document === "undefined") {
        return;
    }
    if (document.getElementById(LOBBY_STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = LOBBY_STYLE_ID;
    style.textContent = LOBBY_CSS;
    document.head.appendChild(style);
};

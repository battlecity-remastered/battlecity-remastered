import importCityLayoutFromJson from '../utils/cityLayoutLoader.js';

class OptionsModal {
    constructor(game, options = {}) {
        this.game = game;
        this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        this.overlay = null;
        this.panel = null;
        this.textArea = null;
        this.status = null;
        this.ensureStyles();
        this.createOverlay();
    }

    ensureStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('battlecity-options-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'battlecity-options-styles';
        style.textContent = `
            .battlecity-options-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 15000;
                padding: 20px;
            }
            .battlecity-options-panel {
                width: min(520px, 100%);
                max-height: calc(100vh - 40px);
                overflow-y: auto;
                background: rgba(10, 12, 20, 0.96);
                border: 1px solid rgba(145, 196, 255, 0.4);
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
                border-radius: 18px;
                padding: 24px 28px;
                color: #f5f7ff;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                flex-direction: column;
                gap: 16px;
                position: relative;
            }
            .battlecity-options-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
            }
            .battlecity-options-title {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                letter-spacing: 0.4px;
                text-transform: uppercase;
            }
            .battlecity-options-close,
            .battlecity-options-action {
                border: none;
                background: rgba(255, 255, 255, 0.08);
                color: #f5f7ff;
                font-size: 14px;
                padding: 8px 14px;
                border-radius: 10px;
                cursor: pointer;
                transition: background 0.2s ease, transform 0.1s ease;
            }
            .battlecity-options-close:hover,
            .battlecity-options-action:hover {
                background: rgba(255, 255, 255, 0.18);
            }
            .battlecity-options-close:active,
            .battlecity-options-action:active {
                transform: translateY(1px);
            }
            .battlecity-options-body {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .battlecity-options-textarea {
                width: 100%;
                min-height: 180px;
                border-radius: 10px;
                border: 1px solid rgba(145, 196, 255, 0.5);
                background: rgba(18, 22, 35, 0.9);
                color: #e9ecff;
                padding: 12px;
                font-size: 13px;
                resize: vertical;
            }
            .battlecity-options-helper {
                font-size: 13px;
                color: rgba(230, 234, 255, 0.8);
            }
            .battlecity-options-status {
                font-size: 13px;
                color: rgba(255, 255, 255, 0.8);
                min-height: 18px;
            }
        `;
        document.head.appendChild(style);
    }

    createOverlay() {
        if (typeof document === 'undefined') {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'battlecity-options-overlay';
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                this.close();
            }
        });

        const panel = document.createElement('div');
        panel.className = 'battlecity-options-panel';

        const header = document.createElement('div');
        header.className = 'battlecity-options-header';

        const title = document.createElement('h2');
        title.className = 'battlecity-options-title';
        title.textContent = 'Options';

        const closeButton = document.createElement('button');
        closeButton.className = 'battlecity-options-close';
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'battlecity-options-body';

        const helper = document.createElement('p');
        helper.className = 'battlecity-options-helper';
        helper.textContent = 'Paste exported city JSON from the builder to load it into your current city. Existing buildings and defenses for your city will be replaced.';

        const textArea = document.createElement('textarea');
        textArea.className = 'battlecity-options-textarea';
        textArea.placeholder = '{ "layout": [...], "defenses": [...] }';

        const actionRow = document.createElement('div');
        actionRow.style.display = 'flex';
        actionRow.style.justifyContent = 'flex-end';

        const loadButton = document.createElement('button');
        loadButton.className = 'battlecity-options-action';
        loadButton.type = 'button';
        loadButton.textContent = 'Load Map';
        loadButton.addEventListener('click', () => this.handleLoad(textArea));

        actionRow.appendChild(loadButton);

        const status = document.createElement('div');
        status.className = 'battlecity-options-status';

        body.appendChild(helper);
        body.appendChild(textArea);
        body.appendChild(actionRow);
        body.appendChild(status);

        panel.appendChild(header);
        panel.appendChild(body);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.panel = panel;
        this.textArea = textArea;
        this.status = status;
        textArea.focus();
    }

    handleLoad(textArea) {
        if (!this.game) {
            this.setStatus('Game is not ready yet.');
            return;
        }
        const payloadText = (textArea?.value || '').trim();
        if (!payloadText.length) {
            this.setStatus('Paste exported layout JSON to import a map.');
            return;
        }
        try {
            const importer = (typeof this.game?.importCityLayoutFromJson === 'function')
                ? this.game.importCityLayoutFromJson
                : (text) => importCityLayoutFromJson(this.game, text);
            const result = importer(payloadText);
            const summary = `Loaded ${result.placedBuildings} buildings and ${result.placedInstallations} hazards/defenses.`;
            const cleanup = [];
            if (result.removedBuildings) {
                cleanup.push(`${result.removedBuildings} existing buildings removed`);
            }
            if (result.removedInstallations) {
                cleanup.push(`${result.removedInstallations} hazards cleared`);
            }
            const skippedTotal = (result.skippedBuildings || 0) + (result.skippedInstallations || 0);
            const statusParts = [summary];
            if (cleanup.length) {
                statusParts.push(cleanup.join(', ') + '.');
            }
            if (skippedTotal > 0) {
                statusParts.push(`${skippedTotal} placements skipped due to validation.`);
            }
            this.setStatus(statusParts.join(' '));
            if (typeof this.game?.notify === 'function') {
                this.game.notify({
                    title: 'Map Imported',
                    message: summary,
                    variant: 'info',
                    timeout: 4200
                });
            }
        } catch (error) {
            const message = error?.message || 'Failed to import layout.';
            this.setStatus(message);
            if (typeof this.game?.notify === 'function') {
                this.game.notify({
                    title: 'Import failed',
                    message,
                    variant: 'warn',
                    timeout: 4800
                });
            }
        }
    }

    setStatus(message) {
        if (this.status) {
            this.status.textContent = message || '';
        }
    }

    close() {
        if (this.overlay?.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.panel = null;
        this.textArea = null;
        if (typeof this.onClose === 'function') {
            this.onClose();
        }
    }
}

export default OptionsModal;

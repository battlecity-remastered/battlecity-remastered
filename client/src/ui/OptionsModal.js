class OptionsModal {
    constructor(game, options = {}) {
        this.game = game;
        this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        this.overlay = null;
        this.panel = null;
        this.section = null;
        this.sectionBody = null;
        this.sectionHeader = null;
        this.sectionChevron = null;
        this.formSection = null;
        this.textArea = null;
        this.revealButton = null;
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

        const badge = document.createElement('span');
        badge.className = 'battlecity-options-badge';
        badge.textContent = 'City Import';

        const closeButton = document.createElement('button');
        closeButton.className = 'battlecity-options-close';
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.close());

        header.appendChild(title);
        title.appendChild(badge);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'battlecity-options-body';

        const section = document.createElement('div');
        section.className = 'battlecity-options-section';

        const sectionHeader = document.createElement('button');
        sectionHeader.className = 'battlecity-options-sectionHeader';
        sectionHeader.type = 'button';

        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'battlecity-options-sectionTitle';
        sectionTitle.innerHTML = `<span>City import</span><span class="battlecity-options-sectionSubtitle">Replace your city layout from a builder export</span>`;

        const chevron = document.createElement('span');
        chevron.className = 'battlecity-options-chevron';
        chevron.innerHTML = '&#9662;';

        sectionHeader.appendChild(sectionTitle);
        sectionHeader.appendChild(chevron);
        sectionHeader.addEventListener('click', () => {
            const open = this.sectionBody?.dataset.open === 'true';
            this.setSectionOpen(!open);
        });

        const sectionBody = document.createElement('div');
        sectionBody.className = 'battlecity-options-sectionBody';
        sectionBody.dataset.open = 'true';
        sectionHeader.setAttribute('aria-expanded', 'true');

        const lead = document.createElement('p');
        lead.className = 'battlecity-options-lead';
        lead.textContent = 'Import a city layout exported from the builder. This replaces your existing structures, defenses, and hazards for the current city slot. More configuration options will land here over time.';

        const steps = document.createElement('ul');
        steps.className = 'battlecity-options-steps';
        [
            'In the city builder, export your layout as JSON.',
            'Join the city you want to overwrite in-game.',
            'Click Paste JSON to reveal the importer, then load.'
        ].forEach((text) => {
            const li = document.createElement('li');
            li.textContent = text;
            steps.appendChild(li);
        });

        const actionsRow = document.createElement('div');
        actionsRow.className = 'battlecity-options-actions';

        const revealButton = document.createElement('button');
        revealButton.className = 'battlecity-options-reveal';
        revealButton.type = 'button';
        revealButton.textContent = 'Paste JSON';
        revealButton.addEventListener('click', () => {
            this.setFormOpen(true);
        });

        actionsRow.appendChild(revealButton);

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

        const formSection = document.createElement('div');
        formSection.className = 'battlecity-options-form';
        formSection.dataset.open = 'false';

        formSection.appendChild(textArea);
        formSection.appendChild(actionRow);
        formSection.appendChild(status);

        sectionBody.appendChild(lead);
        sectionBody.appendChild(steps);
        sectionBody.appendChild(actionsRow);
        sectionBody.appendChild(formSection);

        section.appendChild(sectionHeader);
        section.appendChild(sectionBody);

        body.appendChild(section);

        panel.appendChild(header);
        panel.appendChild(body);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.panel = panel;
        this.section = section;
        this.sectionBody = sectionBody;
        this.sectionHeader = sectionHeader;
        this.sectionChevron = chevron;
        this.formSection = formSection;
        this.textArea = textArea;
        this.revealButton = revealButton;
        this.status = status;
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

        const importer = (typeof this.game?.importCityLayoutFromJson === 'function')
            ? this.game.importCityLayoutFromJson
            : null;

        if (!importer) {
            this.setStatus('Layout import is not available.');
            return;
        }

        this.setStatus('Sending layout to the server...');

        Promise.resolve(importer(payloadText))
            .then((result = {}) => {
                const placedInstallations = (result.placedHazards || 0) + (result.placedDefenses || 0);
                const removedInstallations = (result.removedHazards || 0) + (result.removedDefenses || 0);
                const summary = `Loaded ${result.placedBuildings || 0} buildings and ${placedInstallations} hazards/defenses.`;
                const cleanup = [];
                if (result.removedBuildings) {
                    cleanup.push(`${result.removedBuildings} existing buildings removed`);
                }
                if (removedInstallations) {
                    cleanup.push(`${removedInstallations} hazards cleared`);
                }
                const skippedTotal = (result.skippedBuildings || 0)
                    + (result.skippedHazards || 0)
                    + (result.skippedDefenses || 0);
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
                if (this.game?.forceDraw !== undefined) {
                    this.game.forceDraw = true;
                }
            })
            .catch((error) => {
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
            });
    }

    setStatus(message) {
        if (this.status) {
            this.status.textContent = message || '';
        }
    }

    setSectionOpen(isOpen) {
        if (this.sectionBody) {
            this.sectionBody.dataset.open = isOpen ? 'true' : 'false';
        }
        if (this.sectionHeader) {
            this.sectionHeader.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
    }

    setFormOpen(isOpen) {
        if (isOpen) {
            this.setSectionOpen(true);
        }
        if (this.formSection) {
            this.formSection.dataset.open = isOpen ? 'true' : 'false';
        }
        if (this.revealButton) {
            this.revealButton.disabled = !!isOpen;
            this.revealButton.style.opacity = isOpen ? 0.7 : 1;
        }
        if (isOpen && this.textArea) {
            this.textArea.focus();
        }
    }

    close() {
        if (this.overlay?.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.panel = null;
        this.section = null;
        this.sectionBody = null;
        this.sectionHeader = null;
        this.sectionChevron = null;
        this.formSection = null;
        this.textArea = null;
        this.revealButton = null;
        if (typeof this.onClose === 'function') {
            this.onClose();
        }
    }
}

export default OptionsModal;

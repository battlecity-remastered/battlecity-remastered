class HelpModal {
    constructor(game, options = {}) {
        this.game = game;
        this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        this.overlay = null;
        this.panel = null;
        this.ensureStyles();
        this.createOverlay();
    }

    ensureStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('battlecity-help-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'battlecity-help-styles';
        style.textContent = `
            .battlecity-help-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 15000;
                padding: 20px;
                pointer-events: auto;
            }
            .battlecity-help-panel {
                width: min(520px, 100%);
                max-height: calc(100vh - 40px);
                overflow-y: auto;
                background: rgba(10, 12, 20, 0.95);
                border: 1px solid rgba(145, 196, 255, 0.4);
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
                border-radius: 18px;
                padding: 28px 32px;
                color: #f5f7ff;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                flex-direction: column;
                gap: 18px;
                position: relative;
            }
            .battlecity-help-close {
                position: absolute;
                top: 12px;
                right: 12px;
                border: none;
                background: rgba(255, 255, 255, 0.05);
                color: #f5f7ff;
                font-size: 14px;
                padding: 6px 12px;
                border-radius: 999px;
                cursor: pointer;
                transition: background 0.2s ease;
            }
            .battlecity-help-close:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            .battlecity-help-heading {
                font-size: 22px;
                font-weight: 600;
                margin: 0;
                letter-spacing: 0.3px;
                text-transform: uppercase;
            }
            .battlecity-help-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .battlecity-help-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .battlecity-help-section h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                letter-spacing: 0.2px;
            }
            .battlecity-help-section p {
                margin: 0;
                font-size: 14px;
                line-height: 1.5;
                color: rgba(229, 234, 255, 0.93);
            }
            .battlecity-help-key-row {
                display: flex;
                gap: 8px;
                align-items: baseline;
            }
            .battlecity-help-key {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 70px;
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border: 1px solid rgba(255, 255, 255, 0.5);
            }
            .battlecity-help-key-desc {
                flex: 1;
                font-size: 13px;
                color: rgba(230, 234, 255, 0.9);
            }
            .battlecity-help-section-footer {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.6);
            }
        `;
        document.head.appendChild(style);
    }

    createOverlay() {
        if (typeof document === 'undefined') {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'battlecity-help-overlay';
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                this.close();
            }
        });

        const panel = document.createElement('div');
        panel.className = 'battlecity-help-panel';

        const heading = document.createElement('h1');
        heading.className = 'battlecity-help-heading';
        heading.textContent = 'Help & Controls';

        const closeButton = document.createElement('button');
        closeButton.className = 'battlecity-help-close';
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.close());

        panel.appendChild(closeButton);
        panel.appendChild(heading);
        panel.appendChild(this.createMovementSection());
        panel.appendChild(this.createShortcutSection());
        panel.appendChild(this.createBuildingSection());
        panel.appendChild(this.createScoringSection());

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.panel = panel;
    }

    createMovementSection() {
        const section = document.createElement('div');
        section.className = 'battlecity-help-section';
        const title = document.createElement('h3');
        title.textContent = 'Movement';
        section.appendChild(title);

        const body = document.createElement('p');
        body.textContent = 'Use the arrow keys for every movement input: Up/Down for forward and reverse, Left/Right to spin the turret. WASD support is still under development, so stick with the arrows.';
        section.appendChild(body);

        const extra = document.createElement('p');
        extra.textContent = 'Keep moving to stay ahead of rogues, and remember that immobilizing hazards (freeze/time) will lock you until the effect expires.';
        section.appendChild(extra);
        return section;
    }

    createShortcutSection() {
        const section = document.createElement('div');
        section.className = 'battlecity-help-section';
        const title = document.createElement('h3');
        title.textContent = 'Keyboard shortcuts';
        section.appendChild(title);

        const list = document.createElement('div');
        list.className = 'battlecity-help-list';
        const shortcuts = [
            { key: 'Shift', desc: 'Fire equipped weapon (laser or Cougar rockets; rockets need you to be stationary).' },
            { key: 'Ctrl', desc: 'Fire the Flare Gun spread behind you when you own an Orb icon.' },
            { key: 'D', desc: 'Drop the currently selected icon/item at your marker; press again to adjust the placement.' },
            { key: 'B', desc: 'Instantly arm and drop a bomb from your inventory, even when another icon is selected.' },
            { key: 'H', desc: 'Use a MedKit to instantly restore your health when you have one in inventory.' },
            { key: 'C', desc: 'Activate a 5-second cloak as long as you own the Cloak icon.' },
            { key: 'F', desc: 'Toggle fullscreen on supported browsers.' }
        ];
        shortcuts.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'battlecity-help-key-row';
            const keyLabel = document.createElement('span');
            keyLabel.className = 'battlecity-help-key';
            keyLabel.textContent = entry.key;
            const description = document.createElement('span');
            description.className = 'battlecity-help-key-desc';
            description.textContent = entry.desc;
            row.appendChild(keyLabel);
            row.appendChild(description);
            list.appendChild(row);
        });
        section.appendChild(list);
        const footer = document.createElement('div');
        footer.className = 'battlecity-help-section-footer';
        footer.textContent = 'Weapon availability depends on your inventory; pick up icons to unlock more gear.';
        section.appendChild(footer);
        return section;
    }

    createBuildingSection() {
        const section = document.createElement('div');
        section.className = 'battlecity-help-section';
        const title = document.createElement('h3');
        title.textContent = 'Building overview';
        section.appendChild(title);

        const paragraph = document.createElement('p');
        if (this.game?.player?.isMayor) {
            paragraph.textContent = 'Open the Build button on the panel to reveal the available blueprints. Click a blueprint to preview the ghost building and then click the map to place it—your city must have enough resources and population slots. Use the Demolish button to remove unwanted buildings and recover the tile.';
        } else {
            paragraph.textContent = 'Only mayors can access the build menu. Ask your mayor to open the Build button, select a blueprint, and click the map to place structures, or to demolish old ones if needed.';
        }
        section.appendChild(paragraph);
        const note = document.createElement('p');
        note.textContent = 'Cities can only build when their finance ticks cover the blueprint cost, so keep your income healthy before expanding.';
        section.appendChild(note);
        return section;
    }

    createScoringSection() {
        const section = document.createElement('div');
        section.className = 'battlecity-help-section';
        const title = document.createElement('h3');
        title.textContent = 'Scoring & progress';
        section.appendChild(title);

        const paragraph = document.createElement('p');
        paragraph.textContent = 'Each city tracks a score and orb count that appear in the finance panel, lobby, and right-click inspector. Destroying a rival city with an orb resets their economy, awards your city points based on their growth, and raises the orb bounty you see on other cities.';
        section.appendChild(paragraph);

        const footer = document.createElement('p');
        footer.className = 'battlecity-help-section-footer';
        footer.textContent = 'Stay alive, protect your buildings, and time your orb drops to maximize your bounty.';
        section.appendChild(footer);
        return section;
    }

    close() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.panel = null;
        if (typeof this.onClose === 'function') {
            try {
                this.onClose();
            } catch (error) {
                console.warn('[help] onClose error', error?.message || error);
            }
        }
    }
}

export default HelpModal;

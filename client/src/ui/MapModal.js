import {
    MAP_SQUARE_LAVA,
    MAP_SQUARE_ROCK,
    MAP_SQUARE_BUILDING,
    BUILD_TREE_CONFIG,
    BUILDING_COMMAND_CENTER
} from '../constants';
import { getCityDisplayName } from '../utils/citySpawns';

const DEFAULT_SCALE = 2;
const MAX_SCALE = 4;
const CITY_MARKER_COLOR = '#4da3ff';
const CITY_MARKER_OUTLINE = 'rgba(4, 12, 24, 0.85)';
const PLAYER_MARKER_COLOR = '#fdfefe';
const PLAYER_MARKER_OUTLINE = 'rgba(255, 255, 255, 0.9)';
const TILE_SIZE = 48;
const PLAYER_HALF_SIZE = TILE_SIZE / 2;

const TERRAIN_LEGEND = [
    { id: 'ground', label: 'Grassland & Plains', color: '#27421f' },
    { id: 'rock', label: 'Mountain Ridge', color: '#8d99a6' },
    { id: 'lava', label: 'Lava Field', color: '#d35400' },
    { id: 'building', label: 'Constructed Buildings', color: '#f6d743' }
];

const STRUCTURE_CATEGORY_DEFINITIONS = [
    { id: 'research', label: 'Research Centers', color: '#f7b538', marker: 'structure', defaultFootprint: 3 },
    { id: 'factory', label: 'Factories', color: '#ff6b6b', marker: 'structure', defaultFootprint: 3 },
    { id: 'hospital', label: 'Hospitals', color: '#9b6ef3', marker: 'structure', defaultFootprint: 3 },
    { id: 'housing', label: 'Housing', color: '#6fcf97', marker: 'structure', defaultFootprint: 1 },
    { id: 'support', label: 'Support & Other', color: '#5ad1ff', marker: 'structure', defaultFootprint: 3 },
    { id: 'command', label: 'City Command Center', color: CITY_MARKER_COLOR, marker: 'structure', defaultFootprint: 3 }
];

const LEGEND_ENTRIES = [...TERRAIN_LEGEND, { id: 'player', label: 'Current Position', color: PLAYER_MARKER_COLOR, marker: 'player' }];

const clampScale = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return DEFAULT_SCALE;
    }
    return Math.min(MAX_SCALE, Math.max(1, Math.round(numeric)));
};

const hexToRgba = (hex, alpha = 255) => {
    if (typeof hex !== 'string') {
        return [0, 0, 0, alpha];
    }
    let normalized = hex.trim();
    if (normalized.startsWith('#')) {
        normalized = normalized.slice(1);
    }
    if (normalized.length === 3) {
        normalized = normalized
            .split('')
            .map((char) => `${char}${char}`)
            .join('');
    }
    if (normalized.length !== 6) {
        return [0, 0, 0, alpha];
    }
    const value = parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return [r, g, b, alpha];
};

const TERRAIN_PALETTE = TERRAIN_LEGEND.reduce((acc, entry) => {
    acc[entry.id] = hexToRgba(entry.color);
    return acc;
}, {});

const STRUCTURE_CATEGORY_LOOKUP = STRUCTURE_CATEGORY_DEFINITIONS.reduce((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
}, {});

const STRUCTURE_CATEGORY_ORDER = STRUCTURE_CATEGORY_DEFINITIONS.reduce((acc, entry, index) => {
    acc[entry.id] = index;
    return acc;
}, {});

const BUILDING_LABEL_LOOKUP = BUILD_TREE_CONFIG.reduce((acc, entry) => {
    const typeValue = Number(entry.type);
    if (Number.isFinite(typeValue) && entry.label) {
        acc[typeValue] = entry.label;
    }
    return acc;
}, {});

const DEFAULT_STRUCTURE_OUTLINE = 'rgba(4, 12, 24, 0.82)';

class MapModal {
    constructor(game, options = {}) {
        this.game = game;
        this.scale = clampScale(options.scale);
        this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        this.overlay = null;
        this.panel = null;
        this.canvas = null;
        this.legendContainer = null;
        this.playerIndicator = null;
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.palette = {
            ground: TERRAIN_PALETTE.ground,
            rock: TERRAIN_PALETTE.rock,
            lava: TERRAIN_PALETTE.lava,
            building: TERRAIN_PALETTE.building
        };
        this.ensureStyles();
        this.buildOverlay();
        this.open();
    }

    ensureStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('battlecity-map-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'battlecity-map-styles';
        style.textContent = `
            .battlecity-map-overlay {
                position: fixed;
                inset: 0;
                background: rgba(2, 6, 12, 0.82);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 18000;
                padding: 24px;
                pointer-events: auto;
            }
            .battlecity-map-panel {
                width: min(96vw, 1040px);
                max-height: min(96vh, 1080px);
                overflow: hidden;
                background: rgba(8, 10, 18, 0.96);
                border: 1px solid rgba(145, 196, 255, 0.35);
                box-shadow: 0 28px 56px rgba(0, 0, 0, 0.6);
                border-radius: 20px;
                padding: 20px 24px 24px;
                color: #f1f5ff;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                flex-direction: column;
                gap: 18px;
                position: relative;
                align-items: stretch;
            }
            .battlecity-map-close {
                position: absolute;
                top: 14px;
                right: 14px;
                border: none;
                background: rgba(255, 255, 255, 0.08);
                color: #f1f5ff;
                font-size: 14px;
                padding: 6px 14px;
                border-radius: 999px;
                cursor: pointer;
                transition: background 0.2s ease;
                z-index: 20;
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
            }
            .battlecity-map-close:hover {
                background: rgba(255, 255, 255, 0.18);
            }
            .battlecity-map-content {
                width: 100%;
                display: flex;
                flex: 1;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 18px;
            }
            .battlecity-map-canvas-wrapper {
                width: 100%;
                max-width: min(92vw, 980px);
                display: flex;
                flex-direction: column;
                gap: 14px;
                align-items: center;
                position: relative;
                justify-content: center;
            }
            .battlecity-map-canvas {
                width: min(100%, 980px);
                max-height: calc(90vh - 160px);
                height: auto;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.16);
                background: rgba(15, 19, 30, 0.85);
                image-rendering: pixelated;
                box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
                display: block;
            }
            .battlecity-map-player-indicator {
                position: absolute;
                width: 24px;
                height: 24px;
                clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
                background: linear-gradient(145deg, #ffffff 0%, #f6f9ff 50%, #cfe0ff 100%);
                border: 1px solid rgba(255, 255, 255, 0.95);
                box-shadow:
                    0 0 12px rgba(255, 255, 255, 0.7),
                    0 0 24px rgba(64, 164, 255, 0.65),
                    0 0 40px rgba(64, 164, 255, 0.35);
                animation: battlecity-player-pulse 1200ms ease-in-out infinite;
                z-index: 20;
                pointer-events: none;
                transform-origin: center;
                will-change: transform, opacity, box-shadow;
                mix-blend-mode: screen;
                display: none;
            }
            .battlecity-map-legend {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 10px;
                padding: 10px 14px;
                background: rgba(8, 11, 20, 0.92);
                border-radius: 14px;
                border: 1px solid rgba(145, 196, 255, 0.18);
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
                width: min(92vw, 980px);
                margin: 0 auto;
                align-self: center;
            }
            .battlecity-map-legend-entry {
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(8, 11, 20, 0.88);
                border-radius: 8px;
                padding: 6px 10px;
                border: 1px solid rgba(145, 196, 255, 0.16);
                font-size: 12px;
            }
            .battlecity-map-legend-swatch {
                width: 14px;
                height: 14px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.35);
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
                transition: box-shadow 0.2s ease, transform 0.2s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .battlecity-map-legend-entry[data-marker='player'] .battlecity-map-legend-swatch {
                width: 18px;
                height: 18px;
                border-radius: 0;
                border: none;
                clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
                box-shadow:
                    0 0 0 1px rgba(255, 255, 255, 0.55),
                    0 0 14px rgba(245, 247, 255, 0.65);
                transform: translateY(1px);
            }
            .battlecity-map-legend-label {
                font-size: 12px;
                letter-spacing: 0.2px;
                color: rgba(226, 233, 255, 0.88);
            }
            @keyframes battlecity-player-pulse {
                0% {
                    transform: scale(0.9);
                    opacity: 0.35;
                    box-shadow:
                        0 0 8px rgba(255, 255, 255, 0.35),
                        0 0 18px rgba(64, 164, 255, 0.25),
                        0 0 22px rgba(64, 164, 255, 0.15);
                }
                50% {
                    transform: scale(1.35);
                    opacity: 1;
                    box-shadow:
                        0 0 14px rgba(255, 255, 255, 0.85),
                        0 0 34px rgba(64, 164, 255, 0.7),
                        0 0 46px rgba(64, 164, 255, 0.45);
                }
                100% {
                    transform: scale(0.9);
                    opacity: 0.35;
                    box-shadow:
                        0 0 8px rgba(255, 255, 255, 0.35),
                        0 0 18px rgba(64, 164, 255, 0.25),
                        0 0 22px rgba(64, 164, 255, 0.15);
                }
            }
        `;
        document.head.appendChild(style);
    }

    buildOverlay() {
        if (typeof document === 'undefined') {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'battlecity-map-overlay';
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                this.close();
            }
        });

        const panel = document.createElement('div');
        panel.className = 'battlecity-map-panel';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'battlecity-map-close';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.close());

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'battlecity-map-canvas-wrapper';

        const canvas = document.createElement('canvas');
        canvas.className = 'battlecity-map-canvas';

        const legend = document.createElement('div');
        legend.className = 'battlecity-map-legend';

        canvasWrapper.appendChild(canvas);

        const content = document.createElement('div');
        content.className = 'battlecity-map-content';
        content.appendChild(canvasWrapper);
        content.appendChild(legend);

        panel.appendChild(closeButton);
        panel.appendChild(content);

        overlay.appendChild(panel);
        this.overlay = overlay;
        this.panel = panel;
        this.canvas = canvas;
        this.legendContainer = legend;
    }

    open() {
        if (typeof document === 'undefined') {
            return;
        }
        if (!this.overlay) {
            return;
        }
        if (!this.overlay.isConnected) {
            document.body.appendChild(this.overlay);
        }
        this.render();
        document.addEventListener('keydown', this.handleKeyDown);
        this.isOpen = true;
    }

    close() {
        if (!this.overlay) {
            if (typeof this.onClose === 'function') {
                this.onClose();
            }
            return;
        }
        document.removeEventListener('keydown', this.handleKeyDown);
        if (this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.panel = null;
        this.canvas = null;
        this.legendContainer = null;
        this.isOpen = false;
        if (typeof this.onClose === 'function') {
            this.onClose();
        }
    }

    handleKeyDown(event) {
        if (!event) {
            return;
        }
        if (event.key === 'Escape' || event.key === 'Esc') {
            event.preventDefault();
            this.close();
        }
    }

    render() {
        this.renderLegend();
        const cities = this.collectCities();
        const structures = this.collectStructures();
        const playerPosition = this.getPlayerCenter();
        this.renderMap(cities, structures, playerPosition);
    }

    renderLegend() {
        if (!this.legendContainer) {
            return;
        }
        this.legendContainer.replaceChildren();
        LEGEND_ENTRIES.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'battlecity-map-legend-entry';
            if (entry.marker) {
                row.dataset.marker = entry.marker;
            }
            const swatch = document.createElement('span');
            swatch.className = 'battlecity-map-legend-swatch';
            swatch.style.background = entry.color;
            const label = document.createElement('span');
            label.className = 'battlecity-map-legend-label';
            label.textContent = entry.label;
            row.appendChild(swatch);
            row.appendChild(label);
            this.legendContainer.appendChild(row);
        });
    }

    collectStructures() {
        const structures = [];
        const factory = this.game?.buildingFactory;
        const buildingStore = factory?.buildingsById;
        if (!buildingStore || typeof buildingStore !== 'object') {
            return structures;
        }
        const toTileCoordinate = (value) => {
            if (Number.isFinite(value)) {
                return Math.floor(value);
            }
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return Math.floor(parsed);
            }
            return null;
        };
        const comparator = (a, b) => {
            const hasCityA = typeof a.cityName === 'string' && a.cityName.length > 0;
            const hasCityB = typeof b.cityName === 'string' && b.cityName.length > 0;
            if (hasCityA && hasCityB) {
                const cityCompare = a.cityName.localeCompare(b.cityName);
                if (cityCompare !== 0) {
                    return cityCompare;
                }
            } else if (hasCityA) {
                return -1;
            } else if (hasCityB) {
                return 1;
            }
            const labelCompare = (a.label || '').localeCompare(b.label || '');
            if (labelCompare !== 0) {
                return labelCompare;
            }
            if (a.tileY !== b.tileY) {
                return a.tileY - b.tileY;
            }
            return a.tileX - b.tileX;
        };
        Object.values(buildingStore).forEach((building) => {
            if (!building || typeof building !== 'object') {
                return;
            }
            const numericType = Number(building.type);
            if (!Number.isFinite(numericType)) {
                return;
            }
            const categoryId = this.determineStructureCategory(numericType);
            if (categoryId === 'command' || !STRUCTURE_CATEGORY_LOOKUP[categoryId]) {
                return;
            }
            const tileX = toTileCoordinate(building.x);
            const tileY = toTileCoordinate(building.y);
            if (tileX === null || tileY === null) {
                return;
            }
            const footprint = this.resolveStructureFootprint(building, categoryId);
            const centerTileX = tileX + (footprint.width / 2);
            const centerTileY = tileY + (footprint.height / 2);
            const rawCity = building.city ?? building.cityId ?? null;
            const parsedCity = Number(rawCity);
            const cityId = Number.isFinite(parsedCity) ? parsedCity : null;
            let cityName = null;
            if (cityId !== null) {
                const cityEntry = Array.isArray(this.game?.cities) ? this.game.cities[cityId] : null;
                cityName = this.resolveCityName(cityEntry, cityId);
            }
            const structure = {
                id: building.id ?? `${tileX}_${tileY}_${numericType}`,
                type: numericType,
                category: categoryId,
                label: this.resolveStructureLabel(numericType, categoryId),
                tileX,
                tileY,
                centerTileX,
                centerTileY,
                cityId,
                cityName,
                widthTiles: footprint.width,
                heightTiles: footprint.height
            };
            structures.push(structure);
        });
        structures.sort((a, b) => {
            const orderA = STRUCTURE_CATEGORY_ORDER[a.category] ?? Number.MAX_SAFE_INTEGER;
            const orderB = STRUCTURE_CATEGORY_ORDER[b.category] ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return comparator(a, b);
        });
        return structures;
    }

    resolveStructureFootprint(building, categoryId) {
        if (building && typeof building === 'object') {
            const numericWidth = Number(building.width);
            const numericHeight = Number(building.height);
            if (Number.isFinite(numericWidth) && Number.isFinite(numericHeight)) {
                return {
                    width: Math.max(1, Math.round(numericWidth)),
                    height: Math.max(1, Math.round(numericHeight))
                };
            }
        }
        const definition = STRUCTURE_CATEGORY_LOOKUP[categoryId];
        const fallback = Number.isFinite(definition?.defaultFootprint)
            ? Math.max(1, Math.round(definition.defaultFootprint))
            : 1;
        return {
            width: fallback,
            height: fallback
        };
    }

    resolveStructureLabel(type, categoryId) {
        if (Number.isFinite(type) && BUILDING_LABEL_LOOKUP[type]) {
            return BUILDING_LABEL_LOOKUP[type];
        }
        const definition = STRUCTURE_CATEGORY_LOOKUP[categoryId];
        if (definition) {
            return `${definition.label} (${type})`;
        }
        return `Structure ${type}`;
    }

    determineStructureCategory(type) {
        if (!Number.isFinite(type)) {
            return 'support';
        }
        if (type === BUILDING_COMMAND_CENTER) {
            return 'command';
        }
        if (type >= 400 && type < 500) {
            return 'research';
        }
        if (type >= 100 && type < 200) {
            return 'factory';
        }
        if (type >= 300 && type < 400) {
            return 'housing';
        }
        if (type >= 200 && type < 300) {
            return 'hospital';
        }
        return 'support';
    }

    renderMap(cities, structures, playerPosition) {
        if (!this.canvas) {
            return;
        }
        const map = Array.isArray(this.game?.map) ? this.game.map : null;
        const width = Array.isArray(map) ? map.length : 0;
        const height = width > 0 && Array.isArray(map[0]) ? map[0].length : 0;
        const context = this.canvas.getContext('2d');
        if (!context) {
            return;
        }
        const scale = this.scale;
        if (!width || !height) {
            context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.updatePlayerIndicator(null, scale);
            return;
        }
        const renderWidth = width * scale;
        const renderHeight = height * scale;
        if (this.canvas.width !== renderWidth || this.canvas.height !== renderHeight) {
            this.canvas.width = renderWidth;
            this.canvas.height = renderHeight;
        }
        const imageData = context.createImageData(renderWidth, renderHeight);
        const buffer = imageData.data;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = map[x]?.[y] ?? 0;
                const color = this.getColorForTile(value);
                const r = color[0];
                const g = color[1];
                const b = color[2];
                const a = color[3];
                for (let dy = 0; dy < scale; dy++) {
                    const targetY = (y * scale) + dy;
                    const rowOffset = targetY * renderWidth;
                    for (let dx = 0; dx < scale; dx++) {
                        const targetX = (x * scale) + dx;
                        const index = ((rowOffset + targetX) * 4);
                        buffer[index] = r;
                        buffer[index + 1] = g;
                        buffer[index + 2] = b;
                        buffer[index + 3] = a;
                    }
                }
            }
        }
        context.putImageData(imageData, 0, 0);
        context.imageSmoothingEnabled = false;
        this.drawStructureMarkers(context, structures, scale);
        this.drawCityMarkers(context, cities, scale);
        this.drawPlayerMarker(context, playerPosition, scale);
        this.updatePlayerIndicator(playerPosition, scale);
    }

    drawStructureMarkers(context, structures, scale) {
        if (!Array.isArray(structures) || structures.length === 0) {
            return;
        }
        const markerSize = Math.max(3, Math.round(scale * 1.6));
        structures.forEach((structure) => {
            const fill = '#f6d743';
            const outline = DEFAULT_STRUCTURE_OUTLINE;
            const centerTileX = Number.isFinite(structure.centerTileX)
                ? structure.centerTileX
                : (structure.tileX ?? 0) + 0.5;
            const centerTileY = Number.isFinite(structure.centerTileY)
                ? structure.centerTileY
                : (structure.tileY ?? 0) + 0.5;
            const centerX = centerTileX * scale;
            const centerY = centerTileY * scale;
            if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
                return;
            }
            context.save();
            context.translate(centerX, centerY);
            context.rotate(Math.PI / 4);
            context.fillStyle = fill;
            context.strokeStyle = outline;
            context.lineWidth = Math.max(1, Math.round(scale / 2));
            context.fillRect(-markerSize, -markerSize, markerSize * 2, markerSize * 2);
            context.strokeRect(-markerSize, -markerSize, markerSize * 2, markerSize * 2);
            context.restore();
        });
    }

    drawCityMarkers(context, cities, scale) {
        if (!Array.isArray(cities) || !cities.length) {
            return;
        }
        const markerRadius = Math.max(4, Math.round(scale * 2.5));
        const labelFontSize = Math.max(12, Math.round(scale * 4.5));
        cities.forEach((city) => {
            const centerX = ((city.tileX ?? 0) + 0.5) * scale;
            const centerY = ((city.tileY ?? 0) + 0.5) * scale;
            context.beginPath();
            context.fillStyle = CITY_MARKER_COLOR;
            context.strokeStyle = CITY_MARKER_OUTLINE;
            context.lineWidth = Math.max(1, Math.round(scale / 1.5));
            context.arc(centerX, centerY, markerRadius, 0, Math.PI * 2);
            context.fill();
            context.stroke();
            if (!city.name) {
                return;
            }
            const labelY = centerY + markerRadius + Math.max(4, Math.round(scale));
            context.font = `600 ${labelFontSize}px "Segoe UI", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'top';
            const metrics = context.measureText(city.name);
            const textWidth = metrics.width;
            const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
            const paddingX = Math.max(4, Math.round(scale * 1.5));
            const paddingY = Math.max(2, Math.round(scale));
            context.fillStyle = 'rgba(6, 10, 18, 0.82)';
            context.fillRect(centerX - (textWidth / 2) - paddingX, labelY - paddingY, textWidth + (paddingX * 2), textHeight + (paddingY * 2));
            context.fillStyle = '#f6f9ff';
            context.fillText(city.name, centerX, labelY);
        });
    }

    drawPlayerMarker(context, playerPosition, scale) {
        if (!playerPosition || !this.canvas) {
            return;
        }
        const centerTileX = Number(playerPosition.centerTileX);
        const centerTileY = Number(playerPosition.centerTileY);
        if (!Number.isFinite(centerTileX) || !Number.isFinite(centerTileY)) {
            return;
        }
        const centerX = centerTileX * scale;
        const centerY = centerTileY * scale;
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
            return;
        }
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        if (centerX < 0 || centerY < 0 || centerX > canvasWidth || centerY > canvasHeight) {
            return;
        }
        const markerSize = Math.max(5, Math.round(scale * 2.8));
        const glowSize = Math.max(markerSize * 1.8, markerSize + 6);
        const drawTrianglePath = (ctx, size) => {
            ctx.beginPath();
            ctx.moveTo(0, -size);
            ctx.lineTo(size * 0.85, size * 0.9);
            ctx.lineTo(0, size * 0.55);
            ctx.lineTo(-size * 0.85, size * 0.9);
            ctx.closePath();
        };

        context.save();
        context.translate(centerX, centerY);
        const gradient = context.createRadialGradient(0, 0, markerSize * 0.6, 0, 0, glowSize * 1.4);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, glowSize * 1.3, 0, Math.PI * 2);
        context.fill();
        context.restore();

        context.save();
        context.translate(centerX, centerY);
        context.shadowColor = 'rgba(255, 255, 255, 0.6)';
        context.shadowBlur = glowSize;
        drawTrianglePath(context, glowSize);
        context.fillStyle = 'rgba(255, 255, 255, 0.35)';
        context.fill();
        context.restore();

        context.save();
        context.translate(centerX, centerY);
        drawTrianglePath(context, markerSize);
        context.fillStyle = PLAYER_MARKER_COLOR;
        context.strokeStyle = PLAYER_MARKER_OUTLINE;
        context.lineWidth = Math.max(2, Math.round(scale / 1.2));
        context.fill();
        context.stroke();
        context.restore();
    }

    updatePlayerIndicator(playerPosition, scale) {
        const indicator = this.playerIndicator;
        if (!indicator || !this.canvas) {
            return;
        }
        if (!playerPosition) {
            indicator.style.display = 'none';
            return;
        }
        const centerTileX = Number(playerPosition.centerTileX);
        const centerTileY = Number(playerPosition.centerTileY);
        if (!Number.isFinite(centerTileX) || !Number.isFinite(centerTileY)) {
            indicator.style.display = 'none';
            return;
        }
        const centerX = centerTileX * scale;
        const centerY = centerTileY * scale;
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
            indicator.style.display = 'none';
            return;
        }
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        if (centerX < 0 || centerY < 0 || centerX > canvasWidth || centerY > canvasHeight) {
            indicator.style.display = 'none';
            return;
        }
        const size = Math.max(18, Math.round(scale * 2.4));
        indicator.style.width = `${size}px`;
        indicator.style.height = `${size}px`;
        indicator.style.left = `${centerX - (size / 2)}px`;
        indicator.style.top = `${centerY - (size / 2)}px`;
        indicator.style.display = 'block';
    }

    getPlayerCenter() {
        const offset = this.game?.player?.offset;
        if (!offset || typeof offset !== 'object') {
            return null;
        }
        const rawX = Number(offset.x);
        const rawY = Number(offset.y);
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
            return null;
        }
        const centerTileX = (rawX + PLAYER_HALF_SIZE) / TILE_SIZE;
        const centerTileY = (rawY + PLAYER_HALF_SIZE) / TILE_SIZE;
        if (!Number.isFinite(centerTileX) || !Number.isFinite(centerTileY)) {
            return null;
        }
        const tileX = Math.max(0, Math.floor(centerTileX));
        const tileY = Math.max(0, Math.floor(centerTileY));
        return {
            centerTileX,
            centerTileY,
            tileX,
            tileY
        };
    }

    collectCities() {
        const result = [];
        const list = Array.isArray(this.game?.cities) ? this.game.cities : [];
        list.forEach((entry, index) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const tileX = Number.isFinite(entry.tileX)
                ? entry.tileX
                : Number.isFinite(entry.x)
                    ? Math.round(entry.x / 48)
                    : index;
            const tileY = Number.isFinite(entry.tileY)
                ? entry.tileY
                : Number.isFinite(entry.y)
                    ? Math.round(entry.y / 48)
                    : index;
            const name = this.resolveCityName(entry, index);
            result.push({
                id: Number.isFinite(entry.id) ? entry.id : index,
                name,
                tileX,
                tileY
            });
        });
        result.sort((a, b) => {
            if (!a.name && !b.name) {
                return a.id - b.id;
            }
            if (!a.name) {
                return 1;
            }
            if (!b.name) {
                return -1;
            }
            return a.name.localeCompare(b.name);
        });
        return result;
    }

    resolveCityName(entry, fallbackId) {
        if (!entry || typeof entry !== 'object') {
            return getCityDisplayName(fallbackId);
        }
        if (typeof entry.nameOverride === 'string' && entry.nameOverride.trim().length) {
            return entry.nameOverride.trim();
        }
        if (typeof entry.name === 'string' && entry.name.trim().length) {
            return entry.name.trim();
        }
        const id = Number.isFinite(entry.id) ? entry.id : fallbackId;
        return getCityDisplayName(id);
    }

    getColorForTile(value) {
        if (value === MAP_SQUARE_LAVA) {
            return this.palette.lava;
        }
        if (value === MAP_SQUARE_ROCK) {
            return this.palette.rock;
        }
        if (value >= MAP_SQUARE_BUILDING) {
            return this.palette.building;
        }
        return this.palette.ground;
    }

    isOpen() {
        return Boolean(this.overlay);
    }
}

export default MapModal;

export type ImportEntry = { type: number; dx: number; dy: number; angle: number };
export type ImportLayout = { buildings: ImportEntry[]; installations: ImportEntry[] };
const INSTALLATIONS: Readonly<Record<string, number>> = { bomb: 3, mine: 4, mines: 4, minefield: 4, dfg: 7, wall: 8, turret: 9, turrets: 9, sleeper: 10, sleepers: 10, plasma: 11, plasma_cannon: 11, "plasma cannon": 11 };
const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Each layout entry must be an object.");
    return value as Record<string, unknown>;
};
const integer = (value: unknown): number => {
    if (typeof value !== "number" && typeof value !== "string") throw Error("Layout types and offsets must be numbers.");
    if (String(value).trim() === "" || !Number.isSafeInteger(Number(value))) throw Error("Layout types and offsets must be whole numbers.");
    return Number(value);
};
const parseEntry = (value: unknown, installation: boolean): ImportEntry => {
    const entry = record(value), rawType = entry.type ?? entry.buildingType ?? entry.hazardKey ?? entry.exportType;
    const namedType = typeof rawType === "string" ? INSTALLATIONS[rawType.toLowerCase().trim()] : undefined;
    const type = integer(namedType ?? rawType);
    const dx = integer(entry.dx ?? entry.offsetX), dy = integer(entry.dy ?? entry.offsetY);
    const angle = integer(entry.angle ?? entry.rotation ?? 0);
    if (installation && ![3, 4, 7, 8, 9, 10, 11].includes(type)) throw Error("Unknown defense or hazard type.");
    if (!installation && !isImportBuildingType(type)) throw Error("Unknown building type.");
    return { type, dx, dy, angle: ((angle % 32) + 32) % 32 };
};
const isImportBuildingType = (type: number): boolean => {
    return [0, 200, 300].includes(type) || (type >= 100 && type <= 112) || (type >= 400 && type <= 413);
};
const entries = (value: unknown, maximum: number): unknown[] => {
    if (!Array.isArray(value) || value.length > maximum) throw Error(`Expected a layout array with at most ${maximum} entries.`);
    return value;
};
export const parseCityImport = (text: string): ImportLayout => {
    if (text.length > 196608) throw Error("Layout is too large (maximum 192 KB).");
    let decoded: unknown;
    try { decoded = JSON.parse(text); } catch { throw Error("Invalid JSON. Paste the complete builder export."); }
    const payload = record(decoded);
    const buildings = entries(payload.layout ?? payload.buildings ?? [], 256).map(value => parseEntry(value, false));
    const installations = entries(payload.defenses ?? payload.hazards ?? [], 2048).map(value => parseEntry(value, true));
    if (!buildings.length && !installations.length) throw Error("The export contains no buildings or defenses.");
    if (!buildings.some(entry => entry.type === 0)) buildings.unshift({ type: 0, dx: 0, dy: 0, angle: 0 });
    return { buildings, installations };
};

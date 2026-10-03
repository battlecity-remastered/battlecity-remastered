import callsigns from "./data/callsigns.json" with { type: "json" };

const names = callsigns.filter(name => name.length <= 16);
export const generateGuestCallsign = (): string => {
    const entropy = new Uint32Array(2);
    if (globalThis.crypto) globalThis.crypto.getRandomValues(entropy);
    else { entropy[0] = Math.floor(Math.random() * 0xffffffff); entropy[1] = Math.floor(Math.random() * 0xffffffff); }
    const base = names[entropy[0]! % names.length] ?? "Rampart";
    return `${base}-${(entropy[1]! % 1296).toString(36).toUpperCase().padStart(2, "0")}`;
};

export const isDefaultGuestCallsign = (name: string): boolean => ["Pilot", "TS Pilot", "Player", "Guest"].includes(name);

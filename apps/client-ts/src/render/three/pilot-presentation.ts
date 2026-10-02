import type { LocalState, RemotePlayer } from "../../app/state-types.js";

export type Pilot = LocalState | RemotePlayer;
export const tankLabelText = (pilot: Pilot, mayor: boolean): { name: string; rank: string } => {
    const bot = "botRole" in pilot ? pilot.botRole : undefined;
    const name = pilot.callsign || (bot ? "City Defender" : "Pilot");
    const rank = bot ? `AI · ${bot.replaceAll("_", " ")}` : [pilot.isScoreLeader ? "★ #1" : "", pilot.rankTitle || "Private", mayor ? "Mayor" : ""].filter(Boolean).join(" · ");
    return { name, rank };
};

export const isTankLabelVisible = (pilot: Pilot, localCity: number, now: number): boolean =>
    (pilot.health ?? 100) > 0 && !(pilot.city !== localCity && (pilot.cloakedUntil ?? 0) > now);

export const tankLabelSignature = (pilot: Pilot, mayor: boolean, enemy: boolean): string =>
    `${pilot.callsign}|${pilot.rankTitle}|${pilot.isScoreLeader}|${mayor}|${enemy}|${"botRole" in pilot ? pilot.botRole : ""}`;

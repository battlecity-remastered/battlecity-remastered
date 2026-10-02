import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const resolveScoreDatabasePath = (explicit?: string): string => {
    const preferred = explicit || process.env.BATTLECITY_SCORES_DB_PATH || process.env.SCORES_DB_PATH
        || fileURLToPath(new URL("../../../data/scores.db", import.meta.url));
    const legacy = fileURLToPath(new URL("../../../../../server/data/scores.db", import.meta.url));
    return [preferred, legacy].find(candidate => fs.existsSync(candidate)) || preferred;
};

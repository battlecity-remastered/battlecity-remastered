import type { ClientState } from "../../app/state.js";

export const renderLobbyHighScores = (state: ClientState, scoreList: HTMLElement): void => {
    scoreList.innerHTML = "";
    const ranked = [...state.lobby.highScores]
        .sort((a, b) => {
            const scoreDiff = b.points - a.points;
            if (scoreDiff !== 0) {
                return scoreDiff;
            }
            return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
        })
        .slice(0, 20);

    if (ranked.length === 0) {
        const empty = document.createElement("div");
        empty.className = "lobby-highscore-empty";
        empty.textContent = "No player scores yet.";
        scoreList.appendChild(empty);
        return;
    }

    ranked.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = "lobby-highscore-row";

        const rank = document.createElement("div");
        rank.className = "lobby-highscore-rank";
        rank.textContent = `#${index + 1}`;

        const info = document.createElement("div");
        info.className = "lobby-highscore-info";

        const name = document.createElement("div");
        name.className = "lobby-highscore-name";
        name.textContent = entry.name && entry.name.trim().length > 0
            ? entry.name
            : "Unknown Pilot";

        const meta = document.createElement("div");
        meta.className = "lobby-highscore-meta";
        const details = [`Rank: ${entry.rankTitle}`];
        if (typeof entry.orbs === "number" && Number.isFinite(entry.orbs) && entry.orbs > 0) {
            details.push(`Orbs: ${entry.orbs}`);
        }
        if (typeof entry.assists === "number" && Number.isFinite(entry.assists) && entry.assists > 0) {
            details.push(`Assists: ${entry.assists}`);
        }
        meta.textContent = details.join(" • ");

        info.appendChild(name);
        info.appendChild(meta);

        const score = document.createElement("div");
        score.className = "lobby-highscore-score";
        score.textContent = `${Math.max(0, Math.floor(entry.points)).toLocaleString()} pts`;

        row.appendChild(rank);
        row.appendChild(info);
        row.appendChild(score);
        scoreList.appendChild(row);
    });
};

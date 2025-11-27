"use strict";

const sanitizeText = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
};

const formatRankLabel = (rankTitle) => {
    const resolved = sanitizeText(rankTitle, null);
    return resolved || 'Unranked';
};

const formatRankTag = (rankTitle) => {
    return `[${formatRankLabel(rankTitle)}]`;
};

const formatRankedPlayer = ({ playerName, rankTitle }) => {
    const resolvedName = sanitizeText(playerName, 'Unknown player');
    return `${formatRankTag(rankTitle)} ${resolvedName}`;
};

const formatJoinNotification = ({ playerName, cityName, roleLabel, rankTitle }) => {
    const city = sanitizeText(cityName, 'Unknown city');
    const role = sanitizeText(roleLabel, 'Recruit');
    return `${formatRankedPlayer({ playerName, rankTitle })} joined ${city} as ${role}.`;
};

const formatOrbNotification = ({ playerName, attackerCityName, targetCityName, rankTitle, points }) => {
    const attacker = sanitizeText(attackerCityName, null);
    const target = sanitizeText(targetCityName, 'Unknown city');
    const attackerSuffix = attacker && attacker !== target ? ` for ${attacker}` : '';
    const numericPoints = Number(points);
    const pointsSuffix = Number.isFinite(numericPoints) && numericPoints > 0
        ? ` (+${Math.floor(numericPoints)} pts)`
        : '';
    return `${formatRankedPlayer({ playerName, rankTitle })} orbed ${target}${attackerSuffix}${pointsSuffix}.`;
};

module.exports = {
    formatRankLabel,
    formatRankTag,
    formatRankedPlayer,
    formatJoinNotification,
    formatOrbNotification
};

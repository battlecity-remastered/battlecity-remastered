const botWaypoints = {};
const defenderPaths = {};

export const updateBotWaypoints = (data) => {
    if (data && data.id) {
        botWaypoints[data.id] = data.waypoints;
    }
};

export const updateDefenderPaths = (data) => {
    if (!data || !Array.isArray(data)) {
        return;
    }
    data.forEach((entry) => {
        if (!entry || !entry.id) {
            return;
        }
        defenderPaths[entry.id] = entry.path || null;
    });
};

export const drawBotDebug = (game, g) => {
    if (!game || !g || !game.player?.offset || !game.player?.defaultOffset || !game.debugMode) {
        return;
    }

    const offsetX = game.player.defaultOffset.x - game.player.offset.x;
    const offsetY = game.player.defaultOffset.y - game.player.offset.y;

    // Rogue bot waypoints (red)
    Object.values(botWaypoints).forEach((waypoints) => {
        if (!waypoints || waypoints.length === 0) {
            return;
        }

        g.lineStyle(2, 0xff0000, 1);
        g.moveTo(waypoints[0].x + offsetX, waypoints[0].y + offsetY);
        waypoints.forEach((point, index) => {
            if (index > 0) {
                g.lineTo(point.x + offsetX, point.y + offsetY);
            }
            g.drawCircle(point.x + offsetX, point.y + offsetY, 5);
        });
    });

    // Defender paths (blue)
    Object.values(defenderPaths).forEach((path) => {
        if (!path || path.length === 0) {
            return;
        }
        g.lineStyle(2, 0x0066ff, 1);
        g.moveTo(path[0].x + offsetX, path[0].y + offsetY);
        path.forEach((point, index) => {
            if (index > 0) {
                g.lineTo(point.x + offsetX, point.y + offsetY);
            }
            g.drawCircle(point.x + offsetX, point.y + offsetY, 4);
        });
    });
};

const botWaypoints = {};
const defenderPaths = {};
const systemEntities = new Map();

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
        defenderPaths[entry.id] = {
            path: entry.path || null,
            start: entry.start || null,
            goal: entry.goal || null,
            status: entry.status || 'unknown',
            pathLength: entry.pathLength ?? (entry.path ? entry.path.length : 0),
            targetId: entry.targetId ?? null,
            updatedAt: entry.updatedAt ?? Date.now()
        };
    });
};

const updateSystemEntities = (game) => {
    systemEntities.clear();
    if (!game || !game.otherPlayers) {
        return;
    }
    Object.values(game.otherPlayers).forEach((p) => {
        if (!p || !p.isSystemControlled || !p.offset) {
            return;
        }
        systemEntities.set(p.id, { x: p.offset.x, y: p.offset.y, city: p.city ?? null, type: p.type || null });
    });
};

export const drawBotDebug = (game, g) => {
    if (!game || !g || !game.player?.offset || !game.player?.defaultOffset || !game.debugMode) {
        return;
    }

    const offsetX = game.player.defaultOffset.x - game.player.offset.x;
    const offsetY = game.player.defaultOffset.y - game.player.offset.y;

    updateSystemEntities(game);

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
    Object.values(defenderPaths).forEach((entry) => {
        if (!entry) {
            return;
        }
        const path = entry.path || [];
        if (path.length > 0) {
            g.lineStyle(2, 0x0066ff, 1);
            g.moveTo(path[0].x + offsetX, path[0].y + offsetY);
            path.forEach((point, index) => {
                if (index > 0) {
                    g.lineTo(point.x + offsetX, point.y + offsetY);
                }
                g.drawCircle(point.x + offsetX, point.y + offsetY, 4);
            });
        }

        // Draw start/goal markers so we can see stuck bots even when no path exists
        const start = entry.start || (path.length ? path[0] : null);
        const goal = entry.goal || null;
        if (start) {
            g.lineStyle(0);
            g.beginFill(0x00aaff, 0.8);
            g.drawCircle(start.x + offsetX, start.y + offsetY, 5);
            g.endFill();
        }
        if (goal) {
            g.lineStyle(0);
            g.beginFill(0xff9900, 0.8);
            g.drawCircle(goal.x + offsetX, goal.y + offsetY, 5);
            g.endFill();
        }
    });

    // System-controlled entities (server bots) markers so we can see invisible tanks
    systemEntities.forEach((entity) => {
        g.lineStyle(0);
        g.beginFill(0x00ff88, 0.9);
        g.drawRect((entity.x + offsetX) - 6, (entity.y + offsetY) - 6, 12, 12);
        g.endFill();
    });
};

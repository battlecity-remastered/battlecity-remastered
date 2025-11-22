import {
    TIMER_SHOOT_LASER,
    TIMER_SHOOT_ROCKET,
    TIMER_SHOOT_FLARE,
    ITEM_TYPE_LASER,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_FLARE,
    ITEM_TYPE_MINE,
    ITEM_TYPE_TURRET,
    ITEM_TYPE_PLASMA,
    ITEM_TYPE_WALL,
    ITEM_TYPE_SLEEPER
} from "../constants";
import { SOUND_IDS } from "../audio/AudioManager";
import spawnMuzzleFlash, { computeTankMuzzlePosition, normaliseDirection } from "../effects/muzzleFlash";

const DIRECT_DROP_TYPES = new Set([
    ITEM_TYPE_TURRET,
    ITEM_TYPE_PLASMA,
    ITEM_TYPE_MINE,
    ITEM_TYPE_WALL,
    ITEM_TYPE_SLEEPER,
]);

const computeDropPosition = (game, dropInfo) => {
    if (!game || !game.player || !dropInfo) {
        return { x: game?.player?.offset?.x ?? 0, y: game?.player?.offset?.y ?? 0 };
    }

    if (DIRECT_DROP_TYPES.has(dropInfo.type)) {
        return {
            x: game.player.offset.x + 12,
            y: game.player.offset.y + 24,
        };
    }

    const angle = -game.player.direction;
    const x = (Math.sin((angle / 16) * 3.14) * -1);
    const y = (Math.cos((angle / 16) * 3.14) * -1);

    return {
        x: (game.player.offset.x) + (x * 20),
        y: (game.player.offset.y + 20) + (y * 20),
    };
};

const dropInventoryItem = (game, dropInfo) => {
    if (!dropInfo || !game) {
        return false;
    }

    const { x, y } = computeDropPosition(game, dropInfo);
    const item = game.itemFactory?.newItem?.(dropInfo, x, y, dropInfo.type);
    if (item) {
        game.player.offset.x += 30;
        game.player.offset.x += 30;
    }

    if (!item) {
        const icon = game.iconFactory?.newIcon?.(null, parseInt(x, 10), parseInt(y, 10), dropInfo.type, {
            skipProductionUpdate: true,
            teamId: game.player?.city ?? null,
            city: game.player?.city ?? null,
            isSharedDrop: true,
            synced: false,
        });
        if (icon && game.socketListener && typeof game.socketListener.dropIcon === 'function') {
            game.socketListener.dropIcon({
                id: icon.id,
                type: icon.type,
                x: icon.x,
                y: icon.y,
                cityId: icon.city ?? null,
                teamId: icon.teamId ?? null,
                quantity: icon.quantity ?? 1,
            });
        }
    }

    return true;
};

var lastShot = 0;

const isInteractiveTarget = (event) => {
    if (!event) {
        return false;
    }
    const target = event.target;
    if (!target) {
        return false;
    }
    const tagName = target.tagName ? target.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return true;
    }
    if (target.isContentEditable) {
        return true;
    }
    return false;
};

const hasEquippedItem = (game, type) => {
    if (!game || !game.player || game.player.id === undefined || game.player.id === null) {
        return false;
    }
    if (!game.iconFactory || typeof game.iconFactory.findOwnedIconByType !== 'function') {
        return false;
    }
    const icon = game.iconFactory.findOwnedIconByType(game.player.id, type);
    if (!icon) {
        return false;
    }
    if (icon.quantity === undefined || icon.quantity === null) {
        return true;
    }
    const quantity = Number.isFinite(icon.quantity)
        ? icon.quantity
        : parseInt(icon.quantity, 10);
    if (!Number.isFinite(quantity)) {
        return true;
    }
    return quantity > 0;
};

const playShotSound = (game, soundId, position) => {
    if (!game || !game.audio || !soundId) {
        return;
    }
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        game.audio.playEffect(soundId, { position });
    } else {
        game.audio.playEffect(soundId);
    }
};

var keyboard = (keyCode) => {
    var key = {};
    key.code = keyCode;
    key.isDown = false;
    key.isUp = true;
    key.press = undefined;
    key.release = undefined;
    //The `downHandler`
    key.downHandler = function (event) {
        if (isInteractiveTarget(event)) {
            return;
        }
        if (event.keyCode === key.code) {
            if (key.isUp && key.press) key.press();
            key.isDown = true;
            key.isUp = false;
            event.preventDefault();
        }
    };

    //The `upHandler`
    key.upHandler = function (event) {
        if (isInteractiveTarget(event)) {
            return;
        }
        if (event.keyCode === key.code) {
            if (key.isDown && key.release) key.release();
            key.isDown = false;
            key.isUp = true;
            event.preventDefault();
        }
    };

    //Attach event listeners
    window.addEventListener(
        "keydown", key.downHandler.bind(key), false
    );
    window.addEventListener(
        "keyup", key.upHandler.bind(key), false
    );
    return key;
};


export const setupKeyboardInputs = (game) => {    //Capture the keyboard arrow keys
    var left = keyboard(37),
        up = keyboard(38),
        right = keyboard(39),
        down = keyboard(40),
        shift = keyboard(16),
        ctrl = keyboard(17),
        u = keyboard(85),
        d = keyboard(68),
        s = keyboard(83),
        b = keyboard(66),
        m = keyboard(77),
        o = keyboard(79),
        h = keyboard(72),
        c = keyboard(67),
        f = keyboard(70),
        f3 = keyboard(114); // F3 key for debug mode


    left.press = function () {
        game.player.isTurning = -1;
    };

    left.release = function () {
        game.player.isTurning = 0;
    };

    right.press = function () {
        game.player.isTurning = 1;
    };
    right.release = function () {
        game.player.isTurning = 0;
    };

    up.press = function () {
        game.player.isMoving = -1;
    };
    up.release = function () {
        game.player.isMoving = 0;
    };

    down.press = function () {
        game.player.isMoving = +1;
    };
    down.release = function () {
        game.player.isMoving = 0;
    };

    u.press = function () {
        if (game?.itemFactory && typeof game.itemFactory.pickupOrbItem === 'function') {
            const handled = game.itemFactory.pickupOrbItem();
            if (handled) {
                return;
            }
        }
        if (game?.itemFactory && typeof game.itemFactory.pickupFriendlyMine === 'function') {
            const handled = game.itemFactory.pickupFriendlyMine();
            if (handled) {
                return;
            }
        }
        if (game?.iconFactory && typeof game.iconFactory.pickupIcon === 'function') {
            game.iconFactory.pickupIcon();
        }
    };

    s.press = function () {
        console.log("Generating building output");
        game.buildingFactory.outputBuildings();
    };

    d.press = function () {

        var dropInfo = game.iconFactory.dropSelectedIcon();
        if (dropInfo) {
            dropInventoryItem(game, dropInfo);
        }

    };

    b.press = function () {
        if (!game.iconFactory || typeof game.iconFactory.dropBombFromInventory !== 'function') {
            return;
        }

        const dropInfo = game.iconFactory.dropBombFromInventory();
        if (!dropInfo) {
            console.log("No bombs available to deploy.");
            return;
        }

        dropInventoryItem(game, dropInfo);
    };

    m.press = function () {
        if (typeof game?.toggleMapOverlay === 'function') {
            game.toggleMapOverlay();
        }
    };

    o.press = function () {
        if (!game.iconFactory || typeof game.iconFactory.dropOrbFromInventory !== 'function') {
            return;
        }

        const dropInfo = game.iconFactory.dropOrbFromInventory();
        if (!dropInfo) {
            console.log("No orbs available to deploy.");
            return;
        }

        dropInventoryItem(game, dropInfo);
    };

    h.press = function () {
        if (!game?.itemFactory || typeof game.itemFactory.useMedkit !== 'function') {
            return;
        }
        game.itemFactory.useMedkit();
    };

    c.press = function () {
        if (!game?.itemFactory || typeof game.itemFactory.activateCloak !== 'function') {
            return;
        }
        game.itemFactory.activateCloak();
    };

    f.press = function () {
        if (typeof game?.toggleFullscreen === 'function') {
            game.toggleFullscreen();
        }
    };

    f3.press = function () {
        // Toggle debug mode
        game.debugMode = !game.debugMode;

        // Show or hide the stats panel
        if (game.stats && game.stats.dom) {
            game.stats.dom.style.display = game.debugMode ? 'block' : 'none';
        }

        console.log('Debug mode:', game.debugMode ? 'enabled' : 'disabled');
    };

    ctrl.press = function () {
        if (!hasEquippedItem(game, ITEM_TYPE_FLARE)) {
            return;
        }
        if (game.tick <= lastShot) {
            return;
        }
        if (!game || !game.player) {
            return;
        }
        if (game.player.isFrozen && (game.player.frozenUntil ?? 0) > game.tick) {
            return;
        }

        const currentDirection = normaliseDirection(game.player.direction);
        const reverseCenter = normaliseDirection(currentDirection + 16);
        const reverseLeft = normaliseDirection(currentDirection + 20);
        const reverseRight = normaliseDirection(currentDirection + 12);
        const origin = computeTankMuzzlePosition(game.player.offset, reverseCenter);
        const originX = origin.x;
        const originY = origin.y;
        const teamId = game.player.city ?? null;

        lastShot = game.tick + TIMER_SHOOT_FLARE;
        spawnMuzzleFlash(game, originX, originY);

        [reverseLeft, reverseCenter, reverseRight].forEach((dir) => {
            const shotDirection = normaliseDirection(dir);
            const packet = {
                shooter: game.player.id,
                x: originX,
                y: originY,
                type: 3,
                angle: -shotDirection,
                team: teamId
            };
            game.bulletFactory.newBullet(game.player.id, originX, originY, 3, -shotDirection, teamId);
            game.socketListener.sendBulletShot(packet);
        });
        playShotSound(game, SOUND_IDS.FLARE, { x: originX, y: originY });
    };

    shift.press = function () {
        if (game?.player?.isFrozen && (game.player.frozenUntil ?? 0) > (game.tick || Date.now())) {
            return;
        }
        const hasRocketEquipped = hasEquippedItem(game, ITEM_TYPE_ROCKET);
        const hasLaserEquipped = hasEquippedItem(game, ITEM_TYPE_LASER);
        const isStationary = (game?.player?.isMoving ?? 0) === 0;
        const canFireRocket = hasRocketEquipped && isStationary;

        if (!canFireRocket && !hasLaserEquipped) {
            if (hasRocketEquipped && !isStationary) {
                console.log("Cougar Missiles only fire while stationary.");
            } else {
                console.log("Weapon unavailable: pick up a Laser or Cougar Missile.");
            }
            return;
        }

        const cooldown = canFireRocket ? TIMER_SHOOT_ROCKET : TIMER_SHOOT_LASER;
        const bulletType = canFireRocket ? 1 : 0;

        console.log("shift key pressed");
        if (game.tick > lastShot) {
            lastShot = game.tick + cooldown;

            const direction = normaliseDirection(game.player.direction);
            const muzzle = computeTankMuzzlePosition(game.player.offset, direction);
            const shotAngle = -direction;
            const x2 = muzzle.x;
            const y2 = muzzle.y;
            const teamId = game.player.city ?? null;
            spawnMuzzleFlash(game, x2, y2);
            game.bulletFactory.newBullet(game.player.id, x2, y2, bulletType, shotAngle, teamId);
            const soundId = canFireRocket ? SOUND_IDS.ROCKET : SOUND_IDS.LASER;
            playShotSound(game, soundId, { x: x2, y: y2 });
            game.socketListener.sendBulletShot({
                shooter: game.player.id,
                x: x2,
                y: y2,
                type: bulletType,
                angle: shotAngle,
                team: teamId
            });
        }

    }
};

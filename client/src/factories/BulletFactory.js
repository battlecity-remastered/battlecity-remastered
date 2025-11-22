import {
    BULLET_RANGE_DEFAULT,
    BULLET_RANGE_FLARE,
    BULLET_RANGE_LASER,
    BULLET_RANGE_ROCKET,
    MOVEMENT_SPEED_BULLET,
    MOVEMENT_SPEED_FLARE
} from "../constants.js";
import {BULLET_ALIVE} from "../constants.js";
import {BULLET_DEAD} from "../constants.js";
import {DAMAGE_LASER} from "../constants.js";
import {DAMAGE_ROCKET} from "../constants.js";
import {DAMAGE_FLARE} from "../constants.js";

import {collidedWithRock} from "../collision/collision-bullet.js";
import {collidedWithCurrentPlayer} from "../collision/collision-bullet.js";
import {collidedWithAnotherPlayer} from "../collision/collision-bullet.js";
import {collidedWithBuilding} from "../collision/collision-bullet.js";
import {collidedWithItem} from "../collision/collision-bullet.js";

const DEFENSE_SOURCE_TYPES = new Set(['turret', 'plasma', 'sleeper']);

const isDefenseStructureBullet = (bullet) => {
    if (!bullet) {
        return false;
    }
    const sourceType = typeof bullet.sourceType === 'string'
        ? bullet.sourceType.toLowerCase()
        : '';
    return DEFENSE_SOURCE_TYPES.has(sourceType);
};

const BULLET_DAMAGE_BY_TYPE = {
    0: DAMAGE_LASER,
    1: DAMAGE_ROCKET,
    3: DAMAGE_FLARE,
};

const BULLET_SPEED_BY_TYPE = {
    0: MOVEMENT_SPEED_BULLET,
    1: MOVEMENT_SPEED_BULLET,
    3: MOVEMENT_SPEED_FLARE,
};

const BULLET_RANGE_BY_TYPE = {
    0: BULLET_RANGE_LASER,
    1: BULLET_RANGE_ROCKET,
    3: BULLET_RANGE_FLARE,
};

const getBulletDamage = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_DAMAGE_BY_TYPE, type)) {
        return BULLET_DAMAGE_BY_TYPE[type];
    }
    return DAMAGE_LASER;
};

const getBulletSpeed = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_SPEED_BY_TYPE, type)) {
        return BULLET_SPEED_BY_TYPE[type];
    }
    return MOVEMENT_SPEED_BULLET;
};

const getBulletRange = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_RANGE_BY_TYPE, type)) {
        return BULLET_RANGE_BY_TYPE[type];
    }
    return BULLET_RANGE_DEFAULT;
};

class BulletFactory {

    constructor(game) {
        this.game = game
        this.bulletListHead = null;
    }

    cycle() {
        var bullet = this.bulletListHead;
        while (bullet) {

            var fDir = bullet.angle;
            const defenseShot = isDefenseStructureBullet(bullet);

            const speed = bullet.speed ?? getBulletSpeed(bullet.type);

            const initialX = bullet.x;
            const initialY = bullet.y;
            var x = (Math.sin((fDir / 16) * 3.14) * -1 ) * this.game.timePassed * speed;
            var y = (Math.cos((fDir / 16) * 3.14) * -1) * this.game.timePassed * speed;

            bullet.x += x;
            bullet.y += y;

            if (Number.isFinite(bullet.maxRange)) {
                const stepDistance = Math.hypot(bullet.x - initialX, bullet.y - initialY);
                bullet.travelled = (bullet.travelled ?? 0) + stepDistance;
                if (bullet.travelled >= bullet.maxRange) {
                    bullet.life = BULLET_DEAD;
                }
            }

            // Offscreen
            if (bullet.x < 0 || bullet.x > 24576 || bullet.y < 0 || bullet.y > 24576) {
                bullet.life = BULLET_DEAD;
            }

            if (collidedWithRock(this.game, bullet)) {
                bullet.life = BULLET_DEAD;
            }

            const collidedItem = collidedWithItem(this.game, bullet);
            if (collidedItem) {
                if (defenseShot) {
                    if (this.game.itemFactory && typeof this.game.itemFactory.spawnExplosion === 'function') {
                        const impactX = Number.isFinite(bullet.x) ? bullet.x : collidedItem.x;
                        const impactY = Number.isFinite(bullet.y) ? bullet.y : collidedItem.y;
                        this.game.itemFactory.spawnExplosion(impactX, impactY);
                    }
                    bullet.life = BULLET_DEAD;
                } else {
                    if (this.game.itemFactory && typeof this.game.itemFactory.handleBulletHit === 'function') {
                        const result = this.game.itemFactory.handleBulletHit(collidedItem, bullet) || {};
                        if (result.consumed !== false) {
                            bullet.life = BULLET_DEAD;
                        }
                    } else {
                        bullet.life = BULLET_DEAD;
                    }
                }
            }

            if (collidedWithBuilding(this.game, bullet)) {
                bullet.life = BULLET_DEAD;
            }

            if (collidedWithAnotherPlayer(this.game, bullet)) {
                bullet.life = BULLET_DEAD;
            }


            if (collidedWithCurrentPlayer(this.game, bullet)) {
                bullet.life = BULLET_DEAD;
            }

            if (bullet.life == BULLET_DEAD) {
                bullet = this.deleteBullet(bullet)
            }
            else {
                bullet = bullet.next;
            }
        }
    }

    deleteBullet(bullet) {
        var returnBullet = bullet.next;

        if (bullet.next) {
            bullet.next.previous = bullet.previous;
        }

        if (bullet.previous) {
            bullet.previous.next = bullet.next
        } else {
            this.bulletListHead = bullet.next;
        }

        return returnBullet;
    }

    newBullet(shooter, x, y, type, angle, team = null, options = {}) {
        const bulletType = Number.isFinite(type) ? type : 0;
        const metadata = options || {};

        const resolvedDamage = Number.isFinite(metadata.damage)
            ? metadata.damage
            : getBulletDamage(bulletType);
        const resolvedRange = Number.isFinite(metadata.maxRange)
            ? metadata.maxRange
            : getBulletRange(bulletType);

        var bullet = {
            "shooter": shooter,
            "x": x,
            "y": y,
            "life": BULLET_ALIVE,
            "damage": resolvedDamage,
            "animation": 0,
            "type": bulletType,
            "angle": angle,
            "team": team,
            "speed": getBulletSpeed(bulletType),
            "maxRange": resolvedRange,
            "travelled": 0,
            "sourceId": metadata.sourceId ?? null,
            "sourceType": metadata.sourceType ?? null,
            "targetId": metadata.targetId ?? null,
            "next": null,
            "previous": null
        };


        if (this.bulletListHead) {
            this.bulletListHead.previous = bullet;
            bullet.next = this.bulletListHead
        }

        this.bulletListHead = bullet;

        return bullet;
    }

    getHead() {
        return this.bulletListHead;
    }
}


export default BulletFactory;

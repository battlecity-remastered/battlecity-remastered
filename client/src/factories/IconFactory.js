import { ITEM_TYPE_BOMB, ITEM_TYPE_LIMITS } from "../constants.js";

class IconFactory {
    constructor(game) {
        this.game = game;
        this.iconListHead = null;
        this.iconsById = new Map();
    }

    generateIconId(prefix = "icon") {
        const base = this.game?.socketListener?.io?.id ?? "local";
        return `${prefix}_${base}_${Date.now()}_${Math.random().toString(16).slice(-6)}`;
    }

    normalizeIconId(id) {
        if (typeof id === "string" && id.trim().length > 0) {
            return id.trim();
        }
        return null;
    }

    registerIcon(icon) {
        if (!icon || !icon.id) {
            return;
        }
        this.iconsById.set(icon.id, icon);
    }

    unregisterIcon(icon) {
        if (!icon || !icon.id) {
            return;
        }
        this.iconsById.delete(icon.id);
    }

    getIconById(id) {
        const normalized = this.normalizeIconId(id);
        if (!normalized) {
            return null;
        }
        return this.iconsById.get(normalized) || null;
    }

    removeIconById(id, options = {}) {
        const icon = this.getIconById(id);
        if (!icon) {
            return false;
        }
        if (options.onlyUnowned && icon.owner != null) {
            return false;
        }
        this.deleteIcon(icon);
        return true;
    }

    cycle() {}

    getLimitForType(type) {
        const limit = ITEM_TYPE_LIMITS?.[type];
        return typeof limit === "number" ? limit : Infinity;
    }

    getOwnedQuantity(ownerId, type) {
        if (ownerId === null || ownerId === undefined) {
            return 0;
        }
        let total = 0;
        let node = this.getHead();
        while (node) {
            if (node.owner === ownerId && node.type === type) {
                const quantity = Number.isFinite(node.quantity)
                    ? node.quantity
                    : parseInt(node.quantity, 10) || 1;
                total += Math.max(1, quantity);
            }
            node = node.next;
        }
        return total;
    }

    getAllowedQuantity(ownerId, type, requestedQuantity) {
        const desired = Math.max(1, parseInt(requestedQuantity, 10) || 1);
        if (ownerId === null || ownerId === undefined) {
            return desired;
        }
        const limit = this.getLimitForType(type);
        if (!Number.isFinite(limit)) {
            return desired;
        }
        const owned = this.getOwnedQuantity(ownerId, type);
        const remaining = limit - owned;
        if (remaining <= 0) {
            return 0;
        }
        return Math.min(desired, remaining);
    }

    newIcon(owner, x, y, type, options = {}) {
        const requestedQuantity =
      options.quantity !== undefined ? options.quantity : 1;
        let quantity = Math.max(1, parseInt(requestedQuantity, 10) || 1);
        if (owner !== null && owner !== undefined) {
            const allowed = this.getAllowedQuantity(owner, type, quantity);
            if (allowed <= 0) {
                return null;
            }
            quantity = allowed;
        }

        const resolvedCity =
      options.city !== undefined
          ? options.city
          : owner !== null &&
            owner !== undefined &&
            owner === this.game.player?.id
              ? (this.game.player.city ?? null)
              : null;
        const resolvedTeam =
      options.teamId !== undefined
          ? options.teamId
          : owner !== null &&
            owner !== undefined &&
            owner === this.game.player?.id
              ? (this.game.player.city ?? null)
              : null;
        const resolvedId = this.normalizeIconId(options.id);
        const shouldGenerateId = !resolvedId && options.isSharedDrop;

        var icon = {
            id: resolvedId || (shouldGenerateId ? this.generateIconId("drop") : null),
            owner: owner,
            x: x,
            y: y,
            type: type,
            next: null,
            previous: null,
            sourceBuildingId: options.sourceBuildingId ?? null,
            quantity: quantity,
            selected: !!options.selected,
            armed: !!options.armed,
            city: resolvedCity,
            teamId: resolvedTeam,
            isSharedDrop: !!options.isSharedDrop,
            synced: options.synced !== undefined ? !!options.synced : true,
        };

        console.log("creating icon");
        console.log(icon);
        this.game.forceDraw = true;

        if (this.iconListHead) {
            this.iconListHead.previous = icon;
            icon.next = this.iconListHead;
        }

        this.iconListHead = icon;
        icon.quantity = Math.max(1, parseInt(icon.quantity, 10) || 1);
        this.registerIcon(icon);

        if (this.game.buildingFactory && icon.owner == null && !icon.isSharedDrop) {
            if (
                !icon.sourceBuildingId &&
        typeof this.game.buildingFactory.assignIconSource === "function"
            ) {
                const building = this.game.buildingFactory.assignIconSource(icon);
                if (building) {
                    icon.sourceBuildingId = building.id;
                }
            }
            if (
                !options.skipProductionUpdate &&
        typeof this.game.buildingFactory.handleIconProduced === "function"
            ) {
                this.game.buildingFactory.handleIconProduced(icon);
            }
        }
        if (icon.owner === this.game.player?.id && icon.selected) {
            let node = this.iconListHead;
            while (node) {
                if (node !== icon && node.owner === icon.owner) {
                    node.selected = false;
                    if (node.type === ITEM_TYPE_BOMB) {
                        node.armed = false;
                    }
                }
                node = node.next;
            }
            if (icon.type === ITEM_TYPE_BOMB) {
                icon.armed = !!icon.armed;
                this.game.player.bombsArmed = icon.armed;
            }
            this.game.forceDraw = true;
        }
        return icon;
    }

    pickupIcon() {
        var icon = this.findIconByLocation();
        if (icon) {
            const ownerId = this.game.player.id;
            const isSharedDrop = !!icon.isSharedDrop;
            if (isSharedDrop && icon.synced === false) {
                return;
            }
            const quantityToAdd = icon.quantity ?? 1;
            const allowedQuantity = this.getAllowedQuantity(
                ownerId,
                icon.type,
                quantityToAdd,
            );
            if (allowedQuantity <= 0 || allowedQuantity < quantityToAdd) {
                return;
            }
            const existing = this.findOwnedIconByType(ownerId, icon.type);
            const sharedDropId = isSharedDrop ? icon.id : null;
            const sharedDropTeam = isSharedDrop ? icon.teamId ?? null : null;

            icon.owner = ownerId;
            icon.city = this.game.player.city ?? null;
            icon.teamId = this.game.player.city ?? null;
            icon.quantity = quantityToAdd;
            icon.isSharedDrop = false;
            icon.synced = true;
            if (sharedDropId) {
                this.unregisterIcon(icon);
                icon.id = null;
            }

            if (
                this.game.buildingFactory &&
        typeof this.game.buildingFactory.handleIconCollected === "function" &&
        !isSharedDrop
            ) {
                this.game.buildingFactory.handleIconCollected(icon);
            }

            // Determine which icon will be the final selected item
            let itemToSelect = icon;

            if (existing && existing !== icon) {
                // Merging into existing item
                const limit = this.getLimitForType(icon.type);
                const updatedQuantity = (existing.quantity ?? 1) + quantityToAdd;
                existing.quantity = Number.isFinite(limit)
                    ? Math.min(limit, Math.max(1, updatedQuantity))
                    : Math.max(1, updatedQuantity);
                this.deleteIcon(icon);
                itemToSelect = existing;
            }

            // Always auto-select the picked up item (either new or existing)
            itemToSelect.selected = true;
            if (itemToSelect.type === ITEM_TYPE_BOMB) {
                // Preserve armed state if it was already selected, otherwise default to false
                if (!itemToSelect.armed) {
                    itemToSelect.armed = false;
                }
            } else {
                itemToSelect.armed = false;
            }

            // Deselect all other owned icons (only one can be selected at a time)
            let node = this.getHead();
            while (node) {
                if (node !== itemToSelect && node.owner === ownerId) {
                    node.selected = false;
                    if (node.type === ITEM_TYPE_BOMB) {
                        node.armed = false;
                    }
                }
                node = node.next;
            }

            // Handle bomb arming state
            if (itemToSelect.type === ITEM_TYPE_BOMB) {
                this.game.player.bombsArmed = itemToSelect.armed;
            } else {
                this.game.player.bombsArmed = false;
            }

            if (sharedDropId &&
        this.game.socketListener &&
        typeof this.game.socketListener.collectDroppedIcon === "function") {
                this.game.socketListener.collectDroppedIcon({
                    id: sharedDropId,
                    type: icon.type,
                    cityId: this.game.player.city ?? null,
                    teamId: sharedDropTeam ?? this.game.player.city ?? null,
                    quantity: quantityToAdd,
                });
            }

            this.game.forceDraw = true;
        }
    }

    dropSelectedIcon() {
        var icon = this.getHead();
        var selectedIcon = null;
        while (icon) {
            if (icon.owner == this.game.player.id && icon.selected) {
                selectedIcon = icon;
                break;
            }
            icon = icon.next;
        }
        if (!selectedIcon) {
            return null;
        }

        const quantity = Number.isFinite(selectedIcon.quantity)
            ? selectedIcon.quantity
            : parseInt(selectedIcon.quantity, 10) || 1;
        const safeQuantity = Math.max(1, quantity);
        const dropInfo = {
            type: selectedIcon.type,
            armed: !!selectedIcon.armed,
            owner: this.game.player.id,
            city: this.game.player.city ?? null,
            teamId: this.game.player.city ?? null,
            quantity: 1,
        };

        if (safeQuantity > 1) {
            selectedIcon.quantity = safeQuantity - 1;
            selectedIcon.selected = true;
        } else {
            this.deleteIcon(selectedIcon);
        }

        if (dropInfo.type === ITEM_TYPE_BOMB) {
            if (safeQuantity > 1) {
                selectedIcon.armed = dropInfo.armed;
                this.game.player.bombsArmed = selectedIcon.armed;
            } else {
                this.game.player.bombsArmed = false;
            }
        }

        this.game.forceDraw = true;
        return dropInfo;
    }

    dropBombFromInventory() {
        const ownerId = this.game?.player?.id;
        if (ownerId === null || ownerId === undefined) {
            return null;
        }
        const bombIcon = this.findOwnedIconByType(ownerId, ITEM_TYPE_BOMB);
        if (!bombIcon) {
            return null;
        }

        const quantityRaw = Number.isFinite(bombIcon.quantity)
            ? bombIcon.quantity
            : parseInt(bombIcon.quantity, 10) || 1;
        const quantity = Math.max(1, quantityRaw);
        const dropInfo = {
            type: ITEM_TYPE_BOMB,
            armed: true,
            owner: ownerId,
            city: this.game.player?.city ?? null,
            teamId: this.game.player?.city ?? null,
            quantity: 1,
        };

        if (quantity > 1) {
            bombIcon.quantity = quantity - 1;
            if (bombIcon.selected) {
                bombIcon.armed = true;
                if (this.game?.player) {
                    this.game.player.bombsArmed = true;
                }
            }
        } else {
            const wasSelected = !!bombIcon.selected;
            this.deleteIcon(bombIcon);
            if (wasSelected && this.game?.player) {
                this.game.player.bombsArmed = false;
            }
        }

        this.game.forceDraw = true;
        return dropInfo;
    }

    /**
   *
   * @param selectedIcon
   */
    toggleSelected(selectedIcon) {
        selectedIcon.selected = !selectedIcon.selected;

        var icon = this.getHead();
        while (icon) {
            if (icon.owner == selectedIcon.owner && icon != selectedIcon) {
                console.log("setting other icons selected to false");
                icon.selected = false;
            }
            icon = icon.next;
        }
        if (selectedIcon.type === ITEM_TYPE_BOMB) {
            selectedIcon.armed = selectedIcon.selected;
            this.game.player.bombsArmed = selectedIcon.armed;
        } else if (selectedIcon.selected) {
            this.game.player.bombsArmed = false;
        }
    }

    findIconByLocation() {
        var icon = this.getHead();
        var range = 24;

        const playerCity = this.game.player?.city ?? null;
        while (icon) {
            const allowedTeam =
        icon.teamId === null ||
        icon.teamId === undefined ||
        icon.teamId === playerCity;
            if (
                icon.owner == null &&
        allowedTeam &&
        icon.x >= this.game.player.offset.x - range &&
        icon.x <= this.game.player.offset.x + range &&
        icon.y >= this.game.player.offset.y - range &&
        icon.y <= this.game.player.offset.y + range
            ) {
                return icon;
            }

            icon = icon.next;
        }
        return null;
    }

    findOwnedIconByType(ownerId, type) {
        var icon = this.getHead();
        while (icon) {
            if (icon.owner === ownerId && icon.type === type) {
                return icon;
            }
            icon = icon.next;
        }
        return null;
    }

    consumeOwnedIcon(ownerId, type, amount = 1) {
        if (ownerId === null || ownerId === undefined) {
            return null;
        }
        const icon = this.findOwnedIconByType(ownerId, type);
        if (!icon) {
            return null;
        }
        const quantity = Number.isFinite(icon.quantity)
            ? icon.quantity
            : parseInt(icon.quantity, 10) || 1;
        const consumeAmount = Math.max(1, parseInt(amount, 10) || 1);
        if (quantity <= consumeAmount) {
            this.deleteIcon(icon);
        } else {
            icon.quantity = quantity - consumeAmount;
        }
        this.game.forceDraw = true;
        return icon;
    }

    getSelectedIcon(ownerId) {
        var icon = this.getHead();
        while (icon) {
            if (icon.owner === ownerId && icon.selected) {
                return icon;
            }
            icon = icon.next;
        }
        return null;
    }

    deleteIcon(icon) {
        var returnIcon = icon.next;

        if (icon.next) {
            icon.next.previous = icon.previous;
        }

        if (icon.previous) {
            icon.previous.next = icon.next;
        } else {
            this.iconListHead = icon.next;
        }

        if (
            this.game.player &&
      this.game.player.id === icon.owner &&
      icon.type === ITEM_TYPE_BOMB
        ) {
            this.game.player.bombsArmed = icon.armed;
        }

        this.unregisterIcon(icon);
        icon.id = null;

        return returnIcon;
    }

    purgeCityItems(cityId, itemType = null) {
        const targetType = Number.isFinite(itemType) ? Math.floor(itemType) : null;
        const targetCity = Number.isFinite(cityId) ? Math.floor(cityId) : null;
        let removed = 0;
        let icon = this.getHead();
        while (icon) {
            const matchesType = targetType === null || icon.type === targetType;
            if (!matchesType) {
                icon = icon.next;
                continue;
            }
            const iconCity = Number.isFinite(icon.city)
                ? Math.floor(icon.city)
                : Number.isFinite(icon.teamId)
                    ? Math.floor(icon.teamId)
                    : null;
            if (targetCity !== null && iconCity !== null && iconCity !== targetCity) {
                icon = icon.next;
                continue;
            }
            icon = this.deleteIcon(icon);
            removed += 1;
        }
        if (removed > 0) {
            if (targetType === ITEM_TYPE_BOMB && this.game?.player) {
                this.game.player.bombsArmed = false;
            }
            this.game.forceDraw = true;
        }
        return removed;
    }

    getHead() {
        return this.iconListHead;
    }

    countUnownedIconsNear(x, y, type, radius = 48, teamId = null) {
        let count = 0;
        let icon = this.getHead();
        while (icon) {
            const matchesTeam =
        teamId === null ||
        teamId === undefined ||
        icon.teamId === null ||
        icon.teamId === undefined ||
        icon.teamId === teamId;
            if (icon.owner == null && icon.type === type && matchesTeam && !icon.isSharedDrop) {
                const dx = Math.abs(icon.x - x);
                const dy = Math.abs(icon.y - y);
                if (dx <= radius && dy <= radius) {
                    count++;
                }
            }
            icon = icon.next;
        }
        return count;
    }

    removeUnownedIconsNear(x, y, type, amount, radius = 48, teamId = null) {
        let removed = 0;
        let icon = this.getHead();
        while (icon && removed < amount) {
            const next = icon.next;
            const matchesTeam =
        teamId === null ||
        teamId === undefined ||
        icon.teamId === null ||
        icon.teamId === undefined ||
        icon.teamId === teamId;
            if (icon.owner == null && icon.type === type && matchesTeam && !icon.isSharedDrop) {
                const dx = Math.abs(icon.x - x);
                const dy = Math.abs(icon.y - y);
                if (dx <= radius && dy <= radius) {
                    this.deleteIcon(icon);
                    removed++;
                }
            }
            icon = next;
        }
        return removed;
    }
}

export default IconFactory;

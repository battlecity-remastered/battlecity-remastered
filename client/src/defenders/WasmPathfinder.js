/* eslint-env browser */
/* global Worker */
import { NavMask } from '../bots/navmask.js';
import SimplePathfinder from './SimplePathfinder.js';

class WasmPathfinder {
    constructor(game) {
        this.game = game;
        this.navMask = new NavMask(game);
        this.fallback = new SimplePathfinder(game);
        this.worker = new Worker(new URL('./WasmPathWorker.js', import.meta.url), { type: 'module' });
        this.requestId = 0;
        this.pending = new Map();
        this.ready = this.#warmup();
        this.worker.onmessage = (event) => {
            const { id, type, path, error } = event.data || {};
            if (type === 'ready') {
                const pending = this.pending.get(id);
                if (pending) {
                    pending.resolve(true);
                    this.pending.delete(id);
                }
                return;
            }

            const deferred = this.pending.get(id);
            if (!deferred) {
                return;
            }

            if (type === 'path') {
                deferred.resolve(path || null);
            } else if (type === 'error') {
                deferred.reject(new Error(error || 'wasm worker error'));
            }
            this.pending.delete(id);
        };
    }

    dispose() {
        if (this.worker) {
            this.worker.terminate();
        }
        this.pending.clear();
    }

    async findPath(startX, startY, goalX, goalY, maxNodes = 1500) {
        const mask = this.#buildMaskSnapshot(goalX, goalY);
        if (!mask) {
            return null;
        }

        try {
            await this.ready;
            return await this.#sendPathRequest({ startX, startY, goalX, goalY, mask, maxNodes });
        } catch (err) {
            console.warn('[WasmPathfinder] Falling back to SimplePathfinder:', err?.message || err);
            return this.fallback.findPath(startX, startY, goalX, goalY, maxNodes);
        }
    }

    async #warmup() {
        const id = this.#nextRequestId();
        const promise = new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
        this.worker.postMessage({ id, type: 'warmup' });
        return promise;
    }

    async #sendPathRequest(payload) {
        const id = this.#nextRequestId();
        const promise = new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
        this.worker.postMessage({ id, type: 'path', payload }, [payload.mask.grid.buffer]);
        return promise;
    }

    #buildMaskSnapshot(goalX, goalY, radiusTiles = 40) {
        const mask = this.navMask.getMask(2000, this.#getMaskOptions(goalX, goalY, radiusTiles));
        if (!mask?.bounds || !mask.grid) {
            return null;
        }
        const { width, height } = mask;
        // Copy so the cached navmask grid is not neutered by transferable postMessage
        const grid = new Uint8Array(mask.grid);

        return {
            grid,
            width,
            height,
            left: mask.bounds.left,
            top: mask.bounds.top,
            right: mask.bounds.right,
            bottom: mask.bounds.bottom
        };
    }

    #nextRequestId() {
        this.requestId += 1;
        return this.requestId;
    }

    #getMaskOptions(goalX, goalY, radiusTiles) {
        return {
            centerX: goalX,
            centerY: goalY,
            radiusTiles
        };
    }
}

export default WasmPathfinder;

export type DirtyFlagTracker = {
    shouldRender: (key: string, signature: string) => boolean;
    markDirty: (key: string) => void;
    clear: () => void;
};

export const createDirtyFlagTracker = (): DirtyFlagTracker => {
    const signatures = new Map<string, string>();

    return {
        shouldRender: (key, signature) => {
            const previous = signatures.get(key);
            if (previous === signature) {
                return false;
            }
            signatures.set(key, signature);
            return true;
        },
        markDirty: (key) => {
            signatures.delete(key);
        },
        clear: () => {
            signatures.clear();
        }
    };
};

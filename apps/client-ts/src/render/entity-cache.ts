export const reconcileEntityCache = <T>(
    cache: Map<string, T>,
    desiredIds: Iterable<string>,
    create: (id: string) => T,
    remove: (id: string, entity: T) => void
): void => {
    const desired = new Set(desiredIds);

    for (const id of desired) {
        if (cache.has(id)) {
            continue;
        }
        cache.set(id, create(id));
    }

    for (const [id, entity] of cache.entries()) {
        if (desired.has(id)) {
            continue;
        }
        remove(id, entity);
        cache.delete(id);
    }
};

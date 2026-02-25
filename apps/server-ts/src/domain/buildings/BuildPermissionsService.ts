import type { RuntimeState } from "../../runtime/types.js";

const CANT_BUILD = 0;
const CAN_BUILD = 1;
const HAS_BUILT = 2;
const RESEARCH_PENDING = 3;

type BuildTreeEntry = {
    type: number;
    parent: number;
    initial: number;
};

const BUILD_TREE: ReadonlyArray<BuildTreeEntry> = [
    { type: 300, parent: 0, initial: CAN_BUILD },
    { type: 412, parent: 300, initial: CAN_BUILD },
    { type: 112, parent: 412, initial: CANT_BUILD },
    { type: 401, parent: 300, initial: CAN_BUILD },
    { type: 101, parent: 401, initial: CANT_BUILD },
    { type: 409, parent: 300, initial: CAN_BUILD },
    { type: 109, parent: 409, initial: CANT_BUILD },
    { type: 400, parent: 401, initial: CANT_BUILD },
    { type: 100, parent: 400, initial: CANT_BUILD },
    { type: 402, parent: 401, initial: CANT_BUILD },
    { type: 102, parent: 402, initial: CANT_BUILD },
    { type: 200, parent: 402, initial: CANT_BUILD },
    { type: 411, parent: 409, initial: CANT_BUILD },
    { type: 111, parent: 411, initial: CANT_BUILD },
    { type: 404, parent: 409, initial: CANT_BUILD },
    { type: 104, parent: 404, initial: CANT_BUILD },
    { type: 405, parent: 400, initial: CANT_BUILD },
    { type: 105, parent: 405, initial: CANT_BUILD },
    { type: 403, parent: 400, initial: CANT_BUILD },
    { type: 103, parent: 403, initial: CANT_BUILD },
    { type: 410, parent: 411, initial: CANT_BUILD },
    { type: 110, parent: 410, initial: CANT_BUILD },
    { type: 413, parent: 411, initial: CANT_BUILD },
    { type: 108, parent: 413, initial: CANT_BUILD },
    { type: 407, parent: 404, initial: CANT_BUILD },
    { type: 107, parent: 407, initial: CANT_BUILD },
    { type: 406, parent: 405, initial: CANT_BUILD },
    { type: 106, parent: 406, initial: CANT_BUILD }
];

const CHILDREN_BY_PARENT = BUILD_TREE.reduce<Map<number, BuildTreeEntry[]>>((acc, entry) => {
    const children = acc.get(entry.parent) ?? [];
    children.push(entry);
    acc.set(entry.parent, children);
    return acc;
}, new Map<number, BuildTreeEntry[]>());

const STATE_BY_TYPE_TEMPLATE = BUILD_TREE.reduce<Map<number, number>>((acc, entry) => {
    acc.set(entry.type, entry.initial);
    return acc;
}, new Map<number, number>());

const applyResearchState = (
    states: Map<number, number>,
    researchType: number,
    nextState: number
): void => {
    const children = CHILDREN_BY_PARENT.get(researchType);
    if (!children) {
        return;
    }
    for (const child of children) {
        if (states.get(child.type) === HAS_BUILT) {
            continue;
        }
        states.set(child.type, nextState);
    }
};

export const resolveCityBuildStates = (
    state: RuntimeState,
    cityId: number
): Array<{ type: number; state: number }> => {
    const states = new Map<number, number>(STATE_BY_TYPE_TEMPLATE);

    for (const building of state.buildings.values()) {
        if (building.cityId !== cityId || building.type === 300) {
            continue;
        }
        if (!states.has(building.type)) {
            continue;
        }
        states.set(building.type, HAS_BUILT);
    }

    const queue: number[] = [];
    const queued = new Set<number>();
    for (const [type, buildState] of states.entries()) {
        if (buildState !== HAS_BUILT) {
            continue;
        }
        queue.push(type);
        queued.add(type);
    }

    while (queue.length > 0) {
        const parent = queue.shift();
        if (parent === undefined) {
            continue;
        }
        const children = CHILDREN_BY_PARENT.get(parent);
        if (!children) {
            continue;
        }
        for (const child of children) {
            const current = states.get(child.type) ?? CANT_BUILD;
            if (current === HAS_BUILT) {
                if (!queued.has(child.type)) {
                    queue.push(child.type);
                    queued.add(child.type);
                }
                continue;
            }
            if (current === CANT_BUILD) {
                states.set(child.type, CAN_BUILD);
            }
        }
    }

    const research = state.research.get(cityId);
    if (research?.active) {
        applyResearchState(states, research.active.researchType, RESEARCH_PENDING);
    }
    for (const completed of research?.completed ?? []) {
        applyResearchState(states, completed, CAN_BUILD);
    }

    return BUILD_TREE.map((entry) => ({
        type: entry.type,
        state: states.get(entry.type) ?? CANT_BUILD
    }));
};


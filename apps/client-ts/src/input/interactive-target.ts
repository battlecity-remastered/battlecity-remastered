export const isInteractiveKeyboardTarget = (event: KeyboardEvent): boolean => {
    const target = event.target as Element | null;
    if (!target) {
        return false;
    }
    const tag = target.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
        return true;
    }
    return typeof HTMLElement !== "undefined"
        && target instanceof HTMLElement
        && target.isContentEditable;
};

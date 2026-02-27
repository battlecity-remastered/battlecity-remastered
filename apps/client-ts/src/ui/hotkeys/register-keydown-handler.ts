export const registerKeydownHandler = (
    isHandled: (event: KeyboardEvent) => boolean
): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        if (!isHandled(event)) {
            return;
        }
        event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
        window.removeEventListener("keydown", onKeyDown);
    };
};

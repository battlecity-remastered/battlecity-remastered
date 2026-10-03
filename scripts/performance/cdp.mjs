export const connect = async (endpoint) => {
    const socket = new global.WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    let sequence = 0;
    const pending = new Map(), listeners = new Map();
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const request = pending.get(message.id); pending.delete(message.id);
            if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
        } else for (const listener of listeners.get(message.method) ?? []) listener(message.params);
    });
    return {
        send(method, params = {}) {
            const id = ++sequence;
            return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
        },
        on(method, listener) { const list = listeners.get(method) ?? []; list.push(listener); listeners.set(method, list); },
        close() { socket.close(); }
    };
};

export const evaluate = async (cdp, expression, awaitPromise = false) => {
    const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
};

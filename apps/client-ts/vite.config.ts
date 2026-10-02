import { defineConfig } from "vite";

export default defineConfig({
    server: {
        host: "0.0.0.0",
        port: 8220,
        proxy: { "/api": "http://localhost:8121" }
    }
});

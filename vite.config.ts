import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same PORT override the service reads, so the dev proxy follows it.
const apiPort = process.env.PORT ?? "4310";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  build: { outDir: "dist" },
});

import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = `http://localhost:${process.env.PORT || 31337}`;

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: api,
        changeOrigin: true,
        secure: false,
      },
      "/socket.io/": {
        target: api,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      "/radare2.wasm": {
        target: api,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  assetsInclude: "**/*.wasm",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@agent": path.resolve(__dirname, "..", "agent", "types"),
    },
  },
});

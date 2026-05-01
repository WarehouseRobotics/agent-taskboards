import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "ui",
  server: {
    host: "0.0.0.0",
    port: 8142,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 8142,
  },
  build: {
    outDir: "../dist/ui",
    emptyOutDir: true,
  },
});

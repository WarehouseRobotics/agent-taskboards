import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "ui",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
  },
  server: {
    host: "0.0.0.0",
    port: 8142,
    proxy: {
      "/api": "http://localhost:3000",
      "/uploads": "http://localhost:3000",
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

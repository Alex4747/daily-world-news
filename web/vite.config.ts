import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": `http://127.0.0.1:${process.env.PORT || 8787}` } },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], globals: false },
});

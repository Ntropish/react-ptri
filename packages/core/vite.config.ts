/// <reference types="vitest" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    ssr: true,
    lib: {
      entry: "src/index.ts",
      name: "react-ptri",
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    rollupOptions: {
      external: ["react", "react-dom"],
    },
  },
  plugins: [dts({ include: ["src"] })],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});

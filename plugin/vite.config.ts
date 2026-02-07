import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/ui"),
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        plugin: path.resolve(__dirname, "src/plugin/index.ts"),
        ui: path.resolve(__dirname, "src/ui/index.html"),
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});

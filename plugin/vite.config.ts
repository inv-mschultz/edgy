import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import fs from "fs";

// Figma plugins require two separate outputs:
// 1. plugin.js — the sandbox code (no DOM, no imports)
// 2. ui.html — the UI iframe (single inlined HTML file)
// We use two build configs to avoid the inlineDynamicImports conflict.

export default defineConfig(({ mode }) => {
  const isUI = mode === "ui";
  const versionData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "version.json"), "utf-8")
  );

  if (isUI) {
    return {
      define: {
        __APP_VERSION__: JSON.stringify(versionData.version),
      },
      plugins: [
        react(),
        viteSingleFile(),
        {
          name: "rename-html",
          writeBundle(options, bundle) {
            const fs = require("fs");
            const outDir = options.dir || path.resolve(__dirname, "dist");
            const src = path.join(outDir, "index.html");
            const dest = path.join(outDir, "ui.html");
            if (fs.existsSync(src)) {
              fs.renameSync(src, dest);
            }
          },
        },
        {
          name: "edgy-knowledge-bundle",
          resolveId(id: string) {
            if (id === "virtual:edgy-knowledge") return "\0virtual:edgy-knowledge";
            return null;
          },
          load(id: string) {
            if (id === "\0virtual:edgy-knowledge") {
              const fs = require("fs");
              const YAML = require("yaml");

              const knowledgeDir = path.resolve(__dirname, "../knowledge");

              // Load all rule files
              const rulesDir = path.join(knowledgeDir, "rules");
              const ruleFiles = fs
                .readdirSync(rulesDir)
                .filter((f: string) => f.endsWith(".yml") || f.endsWith(".yaml"));
              const ruleModules: Record<string, unknown> = {};
              for (const file of ruleFiles) {
                const content = fs.readFileSync(path.join(rulesDir, file), "utf-8");
                ruleModules[file] = YAML.parse(content);
              }

              // Load component mappings
              const mappingsContent = fs.readFileSync(
                path.join(knowledgeDir, "components", "component-mappings.yml"),
                "utf-8"
              );
              const componentMappings = YAML.parse(mappingsContent);

              return `export const rules = ${JSON.stringify(ruleModules)};\nexport const componentMappings = ${JSON.stringify(componentMappings)};`;
            }
          },
        },
      ],
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "./src/ui"),
          "@analysis": path.resolve(__dirname, "../analysis/src"),
          fs: path.resolve(__dirname, "src/ui/lib/fs-stub.ts"),
          path: path.resolve(__dirname, "src/ui/lib/fs-stub.ts"),
          url: path.resolve(__dirname, "src/ui/lib/fs-stub.ts"),
          yaml: path.resolve(__dirname, "src/ui/lib/fs-stub.ts"),
        },
      },
      root: path.resolve(__dirname, "src/ui"),
      build: {
        outDir: path.resolve(__dirname, "dist"),
        emptyOutDir: false,
      },
    };
  }

  // Plugin build (default)
  // Figma's sandbox uses an older JS engine — target es2017 to avoid
  // unsupported syntax like optional catch binding (ES2019).
  return {
    build: {
      target: "es2017",
      outDir: "dist",
      emptyOutDir: true,
      lib: {
        entry: path.resolve(__dirname, "src/plugin/index.ts"),
        formats: ["es"],
        fileName: () => "plugin.js",
      },
      rollupOptions: {
        output: {
          entryFileNames: "plugin.js",
        },
      },
    },
  };
});

import { defineConfig } from "vite";

export default defineConfig({
  server: {
    open: "/dev/",
  },
  build: {
    lib: {
      entry: "src/runtime/index.ts",
      name: "Glide",
      formats: ["es", "iife"],
      fileName: (format) => (format === "es" ? "glide.js" : "glide.iife.js"),
    },
    outDir: "dist",
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: {
      // Keep one file per format; effects are imported lazily in code only.
      output: { inlineDynamicImports: true },
    },
  },
});

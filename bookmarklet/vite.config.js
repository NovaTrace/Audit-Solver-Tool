// bookmarklet/vite.config.js — builds the bookmarklet.
//
// Bundles collector.js and its imports into one minified IIFE,
// src/generated/collector.js, usable as a "javascript:" URL.
//   npm run build:bookmarklet   build once (runs before dev and build)
//   npm run dev:bookmarklet     rebuild on save

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false, // public/ is not copied
  build: {
    lib: {
      entry: "bookmarklet/collector.js",
      formats: ["iife"],
      name: "AuditSolverCollector",
      fileName: () => "collector.js",
    },
    outDir: "src/generated",
    emptyOutDir: false,
    minify: true,
  },
});

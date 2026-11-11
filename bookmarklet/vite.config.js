// Builds the bookmarklet: bundles bookmarklet/collector.js and everything
// it imports into ONE minified file, src/generated/collector.js, written as
// an IIFE (a function that runs itself) so it can become a "javascript:" URL.
//
//   npm run build:bookmarklet   build once (runs before dev and build)
//   npm run dev:bookmarklet     rebuild on every save while working on it

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false, // don't copy public/ into the output
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

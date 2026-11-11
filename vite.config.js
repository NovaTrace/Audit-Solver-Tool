// Builds the planner page itself (the bookmarklet has its own config,
// bookmarklet/vite.config.js).
//
// `base` is the folder the site is served from. GitHub Pages serves this
// project at https://<user>.github.io/Audit-Solver-Tool/, not at the top
// of the site, so the built page has to look for its files there. While
// developing (`npm run dev`) the page stays at http://localhost:5173/.

import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Audit-Solver-Tool/" : "/",
}));

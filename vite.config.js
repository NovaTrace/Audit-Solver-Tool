// vite.config.js — builds the planner page. The bookmarklet has its own
// config, bookmarklet/vite.config.js.
//
// `base` is the path the site is served from. GitHub Pages serves this
// project at https://<user>.github.io/Audit-Solver-Tool/; `npm run dev`
// serves it at http://localhost:5173/.

import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Audit-Solver-Tool/" : "/",
}));

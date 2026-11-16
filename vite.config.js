// vite.config.js — builds the planner page. The bookmarklet has its own
// config, bookmarklet/vite.config.js.
//
// `base` is the path the site is served from. GitHub Pages serves this
// project at https://<user>.github.io/Audit-Solver-Tool/; `npm run dev`
// serves it at http://localhost:5173/.
//
// `define` puts the version from package.json into the code as
// import.meta.env.APP_VERSION (shown in the footer by main.js).

import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Audit-Solver-Tool/" : "/",
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(version),
  },
}));

// vite.config.js — builds the planner page. The bookmarklet has its own
// config, bookmarklet/vite.config.js.
//
// `base` is the path the site is served from. GitHub Pages serves this
// project at https://<user>.github.io/Audit-Solver/; `npm run dev`
// serves it at http://localhost:5173/.
//
// `define` puts the version from package.json into the code as
// import.meta.env.APP_VERSION (shown in the footer by main.js).
//
// preloadFirstScreen() lists the fonts and header pattern the first screen
// needs in the built page's <head>, so the browser downloads them alongside
// the CSS instead of after it (Lighthouse: "Network dependency tree" and
// "LCP request discovery").
//
// fontDisplayOptional() stops text from jumping when the fonts arrive after
// the first paint (Lighthouse: layout shift). The browser waits briefly for
// the preloaded fonts; if they are late, that visit uses the fallback fonts
// and the next visit uses the cached ones.

import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

// Built files to preload, matched by name (Vite adds a hash to each).
// IBM Plex Mono 600 is left out: nothing on the first screen uses it.
const PRELOAD_FONTS = [
  /^assets\/inter-latin-400-normal-[\w-]+\.woff2$/,
  /^assets\/inter-latin-600-normal-[\w-]+\.woff2$/,
  /^assets\/ibm-plex-mono-latin-400-normal-[\w-]+\.woff2$/,
];
const PRELOAD_PATTERN = /^assets\/header-pattern-[\w-]+\.svg$/;

function fontDisplayOptional() {
  return {
    name: "font-display-optional",
    transform(code, id) {
      if (id.includes("@fontsource") && id.endsWith(".css")) {
        return code.replaceAll("font-display: swap", "font-display: optional");
      }
    },
  };
}

function preloadFirstScreen() {
  let base = "/";
  return {
    name: "preload-first-screen",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, { bundle }) {
        const files = Object.keys(bundle ?? {});
        const link = (attrs) => ({ tag: "link", attrs, injectTo: "head" });
        return [
          // Fonts must be fetched with crossorigin, even from the same site.
          ...files
            .filter((f) => PRELOAD_FONTS.some((re) => re.test(f)))
            .map((f) =>
              link({
                rel: "preload",
                as: "font",
                type: "font/woff2",
                href: base + f,
                crossorigin: "",
              }),
            ),
          // The header pattern is a CSS mask, which browsers also fetch with
          // crossorigin; without it the preload would be downloaded twice.
          ...files
            .filter((f) => PRELOAD_PATTERN.test(f))
            .map((f) =>
              link({
                rel: "preload",
                as: "image",
                type: "image/svg+xml",
                href: base + f,
                crossorigin: "",
                fetchpriority: "high",
              }),
            ),
        ];
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Audit-Solver/" : "/",
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(version),
  },
  plugins: [fontDisplayOptional(), preloadFirstScreen()],
}));

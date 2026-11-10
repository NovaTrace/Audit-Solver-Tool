// ui/bookmarkletPanel.js — turns the "Grab my audit" link in the
// get-started panel into the real bookmarklet, and wires "Copy code".
//
// The bookmarklet's code is bookmarklet/collector.js, bundled into one file
// by `npm run build:bookmarklet` (run automatically before `npm run dev`
// and `npm run build`). Vite's `?raw` import hands us that file as text.

import collector from "../generated/collector.js?raw";

/**
 * Fingerprint of the bookmarklet code this copy of the planner hands out.
 * It changes whenever the code does, so nothing needs bumping by hand.
 * Taken before the address is filled in, so localhost and the hosted site
 * agree.
 */
export const BOOKMARKLET_VERSION = fingerprint(collector);

/** Build the bookmarklet link and wire the panel's buttons. */
export function setupBookmarkletPanel() {
  const link = document.getElementById("bookmarklet-link");
  const copyButton = document.getElementById("copy-bookmarklet");

  // Where this copy of the planner lives (localhost while developing,
  // the GitHub Pages address once hosted), so the bookmark sends back here.
  const appUrl = new URL(import.meta.env.BASE_URL, location.origin).href;
  const code = collector
    .replaceAll("__APP_URL__", appUrl)
    .replaceAll("__COLLECTOR_VERSION__", BOOKMARKLET_VERSION);

  // A bookmarklet is a URL: "javascript:" + the code, URL-encoded. The
  // wrapper keeps its variables private, and `void 0` stops the browser
  // from replacing the page with the code's return value.
  const href = "javascript:" + encodeURIComponent(`(()=>{${code}})();void 0`);
  link.href = href;

  // Clicking it here would try to run it on the planner; it's meant to be
  // dragged to the bookmarks bar instead.
  const label = link.textContent;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    link.textContent = "Drag me to your bookmarks bar ↑";
    setTimeout(() => (link.textContent = label), 1500);
  });

  // For browsers where dragging doesn't work: copy the URL, then make a
  // bookmark by hand and paste it in as the address.
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(href);
      copyButton.textContent = "Copied! Paste it as a new bookmark's URL";
    } catch {
      copyButton.textContent = "Couldn't copy";
    }
    setTimeout(() => (copyButton.textContent = "Copy code"), 4000);
  });
}

// A short hash of some text, e.g. "1k3x9qa" (FNV-1a: mix in each
// character, then multiply by a large prime, keeping 32 bits)
function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

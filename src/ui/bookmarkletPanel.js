// src/ui/bookmarkletPanel.js — builds the "Grab my audit" bookmarklet link
// and wires "Copy the code".
//
// The code is bookmarklet/collector.js, bundled by
// `npm run build:bookmarklet` (runs before dev and build) and imported
// as text with Vite's `?raw`.
// Used by: main.js.

import collector from "../generated/collector.js?raw";

/**
 * Fingerprint of the bookmarklet code this build hands out. Changes whenever
 * the code does. Taken before the app URL is filled in, so localhost and
 * the hosted site agree.
 */
export const BOOKMARKLET_VERSION = fingerprint(collector);

/** Builds the bookmarklet link and wires the panel's buttons. */
export function setupBookmarkletPanel() {
  const link = document.getElementById("bookmarklet-link");
  const copyButton = document.getElementById("copy-bookmarklet");

  // This planner's own address, so the bookmarklet sends audits back here.
  const appUrl = new URL(import.meta.env.BASE_URL, location.origin).href;
  const code = collector
    .replaceAll("__APP_URL__", appUrl)
    .replaceAll("__COLLECTOR_VERSION__", BOOKMARKLET_VERSION);

  // A bookmarklet is "javascript:" + URL-encoded code. The wrapper keeps
  // variables private; `void 0` keeps the browser from replacing the page
  // with a return value.
  const href = "javascript:" + encodeURIComponent(`(()=>{${code}})();void 0`);
  link.href = href;

  // The link is meant to be dragged; clicking it here only shows a hint.
  // Only the label changes, so the logo stays.
  const labelBox = document.getElementById("bookmarklet-label");
  const label = labelBox.textContent;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    labelBox.textContent = "Drag me to your bookmarks bar ↑";
    setTimeout(() => (labelBox.textContent = label), 1500);
  });

  // Fallback when dragging doesn't work: copy the URL into a new bookmark.
  const copyLabel = copyButton.textContent;
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(href);
      copyButton.textContent = "Copied! Paste it as a new bookmark's URL";
    } catch {
      copyButton.textContent = "Couldn't copy";
    }
    setTimeout(() => (copyButton.textContent = copyLabel), 4000);
  });
}

// Short FNV-1a hash of a string, e.g. "1k3x9qa".
function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

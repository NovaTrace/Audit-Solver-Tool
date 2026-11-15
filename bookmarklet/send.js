// bookmarklet/send.js — delivers the finished audit JSON to the planner.
//
//   sendToApp     opens the planner in a tab and posts the JSON to it
//   downloadJson  saves a .json file for the planner's Import button
//   copyJson      copies the JSON text, to paste on the planner page
//
// sendToApp handshake (postMessage):
//   1. this tab opens the planner
//   2. the planner posts  { type: "audit-solver:ready" }
//   3. this tab replies   { type: "audit-solver:audit", payload: audit }
// Both sides check the sender before trusting a message.
// Used by: collector.js. Receiving side: src/ui/importer.js.

import { downloadJsonFile } from "../src/ui/exporter.js";

const WAIT_MS = 20000; // how long to wait for the planner's "ready"

/**
 * Opens the planner at appUrl and sends it the audit. Resolves once sent;
 * rejects if the tab is blocked or the planner never answers. Must be
 * called directly from a click, or popup blockers intervene.
 */
export function sendToApp(audit, appUrl) {
  const appOrigin = new URL(appUrl).origin;
  return new Promise((resolve, reject) => {
    const planner = window.open(appUrl, "audit-solver");
    if (!planner) {
      reject(
        new Error(
          "The browser blocked the new tab. Allow pop-ups for this site and try again, or use Download instead.",
        ),
      );
      return;
    }

    const timer = setTimeout(() => {
      stop();
      reject(new Error("The planner didn't answer. Try Download instead."));
    }, WAIT_MS);

    function onMessage(event) {
      // Only the tab we opened, on the planner's origin.
      if (event.source !== planner || event.origin !== appOrigin) return;
      if (event.data?.type !== "audit-solver:ready") return;
      planner.postMessage(
        { type: "audit-solver:audit", payload: audit },
        appOrigin,
      );
      stop();
      resolve();
    }

    function stop() {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
  });
}

/** Saves the audit as a .json file. */
export function downloadJson(audit) {
  downloadJsonFile("my-audit.json", JSON.stringify(audit, null, 2));
}

/**
 * Copies the audit's JSON to the clipboard (see setupPaste in
 * src/ui/importer.js).
 */
export function copyJson(audit) {
  return navigator.clipboard.writeText(JSON.stringify(audit));
}

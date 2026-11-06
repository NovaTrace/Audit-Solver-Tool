// bookmarklet/send.js — getting the finished audit JSON to the planner.
//
//   sendToApp     opens the planner in a tab and hands it the JSON
//   downloadJson  saves a .json file the student imports with Import
//   copyJson      copies the JSON text, as a last resort
//
// The handshake for sendToApp, using postMessage (the browser's safe way
// for two tabs on different sites to talk):
//   1. this tab opens the planner
//   2. the planner says   { type: "audit-solver:ready" }
//   3. this tab answers   { type: "audit-solver:audit", payload: audit }
// Each side checks who sent a message before trusting it.

const WAIT_MS = 20000; // give the planner tab this long to say it's ready

/**
 * Open the planner at appUrl and send it the audit. Resolves once sent;
 * rejects if a popup blocker stops the tab or the planner never answers.
 * Call it straight from a button click, or popup blockers step in.
 */
export function sendToApp(audit, appUrl) {
  const appOrigin = new URL(appUrl).origin;
  return new Promise((resolve, reject) => {
    const planner = window.open(appUrl, "audit-solver");
    if (!planner) {
      reject(
        new Error("The browser blocked the new tab. Try Download instead."),
      );
      return;
    }

    const timer = setTimeout(() => {
      stop();
      reject(new Error("The planner didn't answer. Try Download instead."));
    }, WAIT_MS);

    function onMessage(event) {
      // Only the tab we opened, on the planner's own site, counts
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

/** Save the audit as a .json file, for the planner's Import button. */
export function downloadJson(audit) {
  const blob = new Blob([JSON.stringify(audit, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-audit.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // after the download starts
}

/** Copy the audit's JSON text to the clipboard. */
export function copyJson(audit) {
  return navigator.clipboard.writeText(JSON.stringify(audit));
}

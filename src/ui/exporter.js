// ui/exporter.js — Export button: download the current audit as a .json
// file the student can keep, move to another computer, or load back in
// with the Import button.
//
// The file is the same format as everything else (the Audit JSON Data
// Guide), with `source.exportedAt` set. That stamp is how parseAudit()
// knows a file is a saved plan, so importing it restores its own picks.
//
// downloadJsonFile() is also used by the bookmarklet's Download button
// (bookmarklet/send.js), so saving a file works the same way in both.

/**
 * The file to download for an audit: { filename, text }.
 * Pure (no `document`), so it can be tested; never changes `audit`.
 */
export function exportFile(audit, now = new Date()) {
  const data = structuredClone(audit);
  data.source = { ...data.source, exportedAt: now.toISOString() };
  return {
    filename: `audit-plan-${localDate(now)}.json`,
    text: JSON.stringify(data, null, 2), // indented, so it's readable
  };
}

/** Wire the Export button. `getAudit` returns the audit to export. */
export function setupExport(getAudit) {
  document.getElementById("export-btn").addEventListener("click", () => {
    const { filename, text } = exportFile(getAudit());
    downloadJsonFile(filename, text);
  });
}

/**
 * Save `text` as a file called `filename`: wrap it in a Blob, give it a
 * temporary URL, and click a hidden link with a `download` attribute.
 */
export function downloadJsonFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Free the memory once the download has started. Some browsers (Firefox,
  // Safari) start it a moment after the click, so don't revoke right away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "2026-11-06" in the student's own time zone (toISOString would use UTC,
// which can be tomorrow's date in the evening)
function localDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

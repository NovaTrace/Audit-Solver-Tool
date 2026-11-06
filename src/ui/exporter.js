// ui/exporter.js — Export button: download the current audit as a .json
// file the student can keep, move to another computer, or load back in
// with the Import button.
//
// The file is the same format as everything else (the Audit JSON Data
// Guide), with `source.exportedAt` set. That stamp is how parseAudit()
// knows a file is a saved plan, so importing it restores its own picks.

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
    download(filename, text);
  });
}

// Make the browser save `text` as a file: wrap it in a Blob, give it a
// temporary URL, and click a hidden link with a `download` attribute.
function download(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url); // free the memory once the click has started it
}

// "2026-11-06" in the student's own time zone (toISOString would use UTC,
// which can be tomorrow's date in the evening)
function localDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// src/ui/exporter.js — Export button: downloads the current audit as .json.
//
// The file has the standard format (Audit JSON Data Guide) with
// `source.exportedAt` set, which marks it as a saved plan: importing it
// restores its own picks.
// Used by: main.js; bookmarklet/send.js (downloadJsonFile).
// Tests: exporter.test.js.

/** The file for an audit: { filename, text }. Pure; `audit` is not changed. */
export function exportFile(audit, now = new Date()) {
  const data = structuredClone(audit);
  data.source = { ...data.source, exportedAt: now.toISOString() };
  return {
    filename: `audit-plan-${localDate(now)}.json`,
    text: JSON.stringify(data, null, 2), // indented for reading
  };
}

/** Wires the Export button. `getAudit` returns the audit to export. */
export function setupExport(getAudit) {
  document.getElementById("export-btn").addEventListener("click", () => {
    const audit = getAudit();
    if (!audit) return; // empty page; the button is hidden anyway
    const { filename, text } = exportFile(audit);
    downloadJsonFile(filename, text);
  });
}

/** Downloads `text` as a file, using a Blob URL and a temporary link. */
export function downloadJsonFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after a delay: Firefox and Safari start the download slightly after
  // the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "2026-11-06" in local time (toISOString would use UTC).
function localDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

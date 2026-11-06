// ui/importer.js — Import button: pick a file, check it, read it,
// and hand the contents to main.js, which loads it with importAudit().
//
// This file only READS files. Whether the contents are a valid audit is
// decided by parseAudit() (through state.js), not here.

// Sites the bookmarklet may send an audit from. While developing, a local
// test page counts too.
const AUDIT_ORIGINS = ["https://datc.prod.cu.edu"];
const isAuditOrigin = (origin) =>
  AUDIT_ORIGINS.includes(origin) ||
  (import.meta.env.DEV && /^http:\/\/localhost(:\d+)?$/.test(origin));

const ALLOWED_TYPES = [".pdf", ".json"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Wire the Import button (and the "upload a PDF/JSON" link in the
 * get-started panel). `onImport` gets { kind: "json", content: object }.
 */
export function setupImport(onImport) {
  const input = document.getElementById("import-file");
  const openPicker = () => input.click();

  document.getElementById("import-btn").addEventListener("click", openPicker);
  document.getElementById("import-alt")?.addEventListener("click", openPicker);

  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = ""; // so choosing the same file again still works
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!ALLOWED_TYPES.some((ext) => name.endsWith(ext))) {
      alert("Please choose a .pdf or .json file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      alert("That file is too large (10 MB max).");
      return;
    }
    if (name.endsWith(".pdf")) {
      // Step 8: read the PDF's text with pdf.js and turn it into audit JSON
      alert(
        "PDF import isn't available yet. Use the bookmarklet, or a .json file you exported.",
      );
      return;
    }

    // Reading problems (not JSON at all) are handled here; problems with
    // the audit itself are handled by onImport.
    let content;
    try {
      content = JSON.parse(await file.text());
    } catch (e) {
      console.warn("Import failed:", e);
      alert("Sorry, that file couldn't be read. Is it a .json file?");
      return;
    }
    onImport({ kind: "json", content });
  });
}

/**
 * Receive an audit from the bookmarklet's "Send to Audit Solver" button.
 * The bookmarklet opens this page in a new tab, so `window.opener` is the
 * audit tab. We tell it we're ready, then accept ONE audit message from it.
 * `onImport` gets { kind: "json", content: object }, like a file import.
 */
export function setupReceiver(onImport) {
  const auditTab = window.opener;
  if (!auditTab) return; // opened normally, not by the bookmarklet

  window.addEventListener("message", function onMessage(event) {
    // Only the tab that opened us, on the audit site, with an audit
    if (event.source !== auditTab || !isAuditOrigin(event.origin)) return;
    if (event.data?.type !== "audit-solver:audit") return;
    window.removeEventListener("message", onMessage);
    onImport({ kind: "json", content: event.data.payload });
  });

  // "*" is fine here: this message carries no data, it only says "ready"
  auditTab.postMessage({ type: "audit-solver:ready" }, "*");
}

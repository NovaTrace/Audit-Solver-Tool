// ui/importer.js — the three ways audit data reaches the planner:
//   setupImport    the Import button: pick a .json file, or an audit PDF
//   setupPaste     Ctrl+V: audit JSON copied by the bookmarklet's Copy button
//   setupReceiver  the bookmarklet's Send button (a message from its tab)
// Each hands the contents to main.js, which loads it with importAudit().
//
// This file only READS the data. Whether it's a valid audit is decided by
// parseAudit() (through state.js), not here.

import { textLines, pdfToAudit } from "../logic/pdfAudit.js";
import { AuditError } from "../logic/parser.js";

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
      const content = await auditFromPdf(file);
      if (content) onImport({ kind: "json", content });
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
 * An audit PDF -> audit JSON, or null (after telling the student why) if
 * it couldn't be read. Both kinds of audit PDF work: the audit page
 * printed to PDF, and the audit site's own PDF.
 */
async function auditFromPdf(file) {
  try {
    // Loaded only now, so pdf.js isn't downloaded unless a PDF is chosen
    const { readPdfPages } = await import("./pdfReader.js");
    return pdfToAudit(textLines(await readPdfPages(file)));
  } catch (e) {
    console.warn("PDF import failed:", e);
    alert(
      e instanceof AuditError
        ? e.message // e.g. "That PDF doesn't look like a degree audit…"
        : "Sorry, that PDF couldn't be read. Try the bookmarklet instead.",
    );
    return null;
  }
}

/**
 * The audit in a piece of pasted text, or null if the text isn't one.
 * Only JSON whose `schema` starts with "audit-solver/" counts, so pasting
 * anything else on the page does nothing. (parseAudit still decides
 * whether the audit is valid.) Pure, so it's tested in importer.test.js.
 */
export function auditFromText(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null; // not a JSON object: skip quickly
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const schema = data?.schema;
  return typeof schema === "string" && schema.startsWith("audit-solver/")
    ? data
    : null;
}

/**
 * Let the student paste (Ctrl+V) audit JSON anywhere on the page: the
 * other half of the bookmarklet's Copy button. Pasting into a text box
 * (the search field) is left alone.
 * `onImport` gets { kind: "json", content: object }, like a file import.
 */
export function setupPaste(onImport) {
  document.addEventListener("paste", (event) => {
    if (event.target.closest?.("input, textarea")) return;
    const content = auditFromText(event.clipboardData?.getData("text") ?? "");
    if (!content) return;
    event.preventDefault();
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

  // Say "ready" only to the audit site: the browser drops a message whose
  // target doesn't match the tab's site. While developing, the test page's
  // localhost port isn't known ahead of time, so allow any site there.
  const targets = import.meta.env.DEV ? ["*"] : AUDIT_ORIGINS;
  for (const origin of targets) {
    auditTab.postMessage({ type: "audit-solver:ready" }, origin);
  }
}

// src/ui/importer.js — the ways audit data reaches the planner.
//
//   setupImport    Import button: a .json file or an audit PDF
//   setupPaste     Ctrl+V: JSON copied by the bookmarklet
//   setupReceiver  the bookmarklet's Send button (a message from its tab)
//
// Each passes { kind: "json", content } to the callback from main.js.
// Reads data only; parseAudit() (through state.js) validates it.
// Used by: main.js. Tests: importer.test.js.

import { textLines, pdfToAudit } from "../logic/pdfAudit.js";
import { AuditError } from "../logic/parser.js";

// Origins the bookmarklet may send an audit from. In development, localhost is
// allowed too.
const AUDIT_ORIGINS = ["https://datc.prod.cu.edu"];
const isAuditOrigin = (origin) =>
  AUDIT_ORIGINS.includes(origin) ||
  (import.meta.env.DEV && /^http:\/\/localhost(:\d+)?$/.test(origin));

const ALLOWED_TYPES = [".pdf", ".json"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Wires the Import button and the "upload a PDF or JSON file" link. */
export function setupImport(onImport) {
  const input = document.getElementById("import-file");
  const openPicker = () => input.click();

  document.getElementById("import-btn").addEventListener("click", openPicker);
  document.getElementById("import-alt")?.addEventListener("click", openPicker);

  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = ""; // lets the same file be chosen again
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

    // Unreadable files are reported here; invalid audits by onImport.
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
 * Audit PDF -> audit JSON, or null after telling the student why it failed.
 * Both PDF layouts are supported (logic/pdfAudit.js).
 */
async function auditFromPdf(file) {
  try {
    // Loaded on demand, so pdf.js is downloaded only when a PDF is chosen.
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
 * The audit in pasted text, or null. Only JSON whose `schema` starts with
 * "audit-solver/" counts; parseAudit still validates it.
 */
export function auditFromText(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null; // not a JSON object
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

/** Accepts audit JSON pasted anywhere on the page, except into a text field. */
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
 * Receives an audit from the bookmarklet's Send button. The bookmarklet
 * opens this page in a new tab, so `window.opener` is the audit tab. Posts
 * "ready" to it, then accepts one audit message.
 */
export function setupReceiver(onImport) {
  const auditTab = window.opener;
  if (!auditTab) return; // not opened by the bookmarklet

  window.addEventListener("message", function onMessage(event) {
    // Only from the opener, on the audit site, carrying an audit.
    if (event.source !== auditTab || !isAuditOrigin(event.origin)) return;
    if (event.data?.type !== "audit-solver:audit") return;
    window.removeEventListener("message", onMessage);
    onImport({ kind: "json", content: event.data.payload });
  });

  // "ready" goes only to the audit site; the browser drops a message whose
  // target origin doesn't match. In development the localhost port is unknown,
  // so any origin is allowed.
  const targets = import.meta.env.DEV ? ["*"] : AUDIT_ORIGINS;
  for (const origin of targets) {
    auditTab.postMessage({ type: "audit-solver:ready" }, origin);
  }
}

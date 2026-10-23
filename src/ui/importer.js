// ui/importer.js — Import button: pick a file, check it, read it,
// and hand the contents to main.js. Parsing happens in logic/parser.js.

const ALLOWED_TYPES = [".pdf", ".json"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function setupImport(onImport) {
  const button = document.getElementById("import-btn");
  const input = document.getElementById("import-file");

  button.addEventListener("click", () => input.click());

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

    try {
      onImport(await readFile(file));
    } catch (e) {
      console.warn("Import failed:", e);
      alert("Sorry, that file couldn't be read.");
    }
  });
}

// File -> { kind: "json", content: object } or { kind: "pdf", content: text }
async function readFile(file) {
  if (file.name.toLowerCase().endsWith(".json")) {
    return { kind: "json", content: JSON.parse(await file.text()) };
  }
  return { kind: "pdf", content: await readPdfText(file) };
}

async function readPdfText(file) {
  // Later: load pdf.js only when someone actually picks a PDF, e.g.
  //   const pdfjs = await import("pdfjs-dist");
  throw new Error(`PDF import isn't built yet (${file.name})`);
}

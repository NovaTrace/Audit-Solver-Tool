// src/ui/pdfReader.js — extracts text pieces from a PDF with pdf.js.
//
// Only reads the pieces; logic/pdfAudit.js turns them into an audit.
// Loaded on demand by ui/importer.js, so pdf.js is downloaded only when a
// PDF is chosen. The PDF is read in the browser and sent nowhere.

import * as pdfjs from "pdfjs-dist";
// pdf.js parses in a worker script; `?url` gives that script's address.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * PDF file -> text pieces, one list per page: [[{ str, x, y, width }]].
 * x and y are the piece's start; y counts up from the bottom.
 */
export async function readPdfPages(file) {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((item) => ({
        str: item.str,
        x: item.transform[4], // transform = [a, b, c, d, x, y]
        y: item.transform[5],
        width: item.width,
      })),
    );
  }
  return pages;
}

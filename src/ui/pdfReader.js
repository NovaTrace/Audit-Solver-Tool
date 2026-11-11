// ui/pdfReader.js — pulling the text out of a PDF file, with pdf.js
// (Mozilla's PDF reader, the same one Firefox uses to show PDFs).
//
// This file only gets the text pieces off each page. Making lines out of
// them and reading the audit is logic/pdfAudit.js, which has no pdf.js in
// it and so can be tested.
//
// pdf.js is large, so importer.js loads this file only when a PDF is
// chosen (`await import(...)`); students who never import a PDF never
// download it. The PDF is read here in the browser and sent nowhere.

import * as pdfjs from "pdfjs-dist";
// pdf.js does its heavy work in a second script (a "worker") so the page
// doesn't freeze. `?url` asks Vite for that script's address.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * A PDF file -> its text pieces, one list per page:
 * [[{ str, x, y, width }, ...], ...]. `str` is the words; x and y are
 * where the piece starts on the page (y counts up from the bottom).
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

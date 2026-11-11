// bookmarklet/scrape/student.js — the audit's header and overall totals.
//
//   name / degree     the two headings at the top (.h5, then h1.h5)
//   header fields     "Prepared On <br> 11/05/2026 01:32 PM" style blocks
//   totals            the sub-requirements for the degree's minimum hours
//                     ("A minimum of 128 … hours") and the overall GPA:
//                     picked out by src/logic/auditBuild.js, which the PDF
//                     import shares

import {
  auditRoot,
  text,
  lines,
  requirementBlocks,
  readSubrequirement,
} from "./dom.js";
import { studentTotals } from "../../src/logic/auditBuild.js";

/** The audit page -> the `student` object (see the Audit JSON Data Guide). */
export function scrapeStudent(doc) {
  const degree = doc.querySelector("h1.h5");
  const field = headerFields(doc);
  const prepared = field["Prepared On"]?.match(
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)/,
  );
  const programs = text(doc.querySelector(".includeTopText")).match(
    /Program:\s*([A-Z0-9, -]+?)(?:\s+AT LEAST|\s*$|\s{2})/,
  );

  const subs = requirementBlocks(auditRoot(doc)).flatMap((r) =>
    [...r.querySelectorAll(".subrequirement")].map(readSubrequirement),
  );

  return {
    name: text(degree?.previousElementSibling) || "Unknown student",
    degreeTitle: text(degree),
    programCode: field["Program Code"] || null,
    programs: programs
      ? programs[1]
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [],
    catalogYear: field["Catalog Year"] || null,
    preparedOn: prepared ? toIsoLocal(prepared) : null,
    graduationDate: field["Graduation Date"] || null,
    allRequirementsMet: !doc.querySelector(".completionTextNO"),
    ...studentTotals(subs),
  };
}

// The header's "Label <br> value" blocks -> { "Prepared On": "11/05/...", ... }
function headerFields(doc) {
  const fields = {};
  for (const b of doc.querySelectorAll(".col-auto > b")) {
    const [label, ...rest] = lines(b);
    if (label) fields[label] = rest.join(" ");
  }
  return fields;
}

// "11/05/2026 01:32 PM" pieces -> "2026-11-05T13:32:00"
function toIsoLocal([, month, day, year, hour, minute, ampm]) {
  let h = Number(hour) % 12;
  if (ampm === "PM") h += 12;
  return `${year}-${month}-${day}T${String(h).padStart(2, "0")}:${minute}:00`;
}

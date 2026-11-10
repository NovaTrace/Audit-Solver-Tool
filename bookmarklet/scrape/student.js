// bookmarklet/scrape/student.js — the audit's header and overall totals.
//
//   name / degree     the two headings at the top (.h5, then h1.h5)
//   header fields     "Prepared On <br> 11/05/2026 01:32 PM" style blocks
//   totals            the sub-requirements for the degree's minimum hours
//                     ("A minimum of 128 … hours") and the overall GPA

import { auditRoot, text, num, lines, requirementBlocks } from "./dom.js";

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

  const subs = requirementBlocks(auditRoot(doc)).flatMap((r) => [
    ...r.querySelectorAll(".subrequirement"),
  ]);
  const minimum = degreeHours(subs);
  const gpa = overallGpa(subs);

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
    hoursRequired: minimum?.hours ?? null,
    hoursEarned: num(minimum?.sub.querySelector(".subreqEarned .hours")),
    hoursInProgress: num(minimum?.sub.querySelector(".subreqIpHours .hours")),
    gpa: num(gpa?.querySelector(".gpaDetail .gpa")),
    attemptedHours: num(gpa?.querySelector(".gpaDetail .hours")),
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

// The degree's total-hours rule: the sub-requirement whose title says "a
// minimum of N" with the largest N (128 for the degree beats 30 for
// residency). Found by its wording, not its heading, which varies by school.
// -> { sub, hours } or undefined
function degreeHours(subs) {
  let best;
  for (const sub of subs) {
    const match = text(sub.querySelector(".subreqTitle")).match(
      /minimum of (\d+)/i,
    );
    const hours = match && Number(match[1]);
    if (hours && (!best || hours > best.hours)) best = { sub, hours };
  }
  return best;
}

// The overall GPA: a sub-requirement with a GPA table (.gpaDetail). If there
// are several (e.g. a major GPA too), prefer the overall one.
function overallGpa(subs) {
  const withGpa = subs.filter((s) => s.querySelector(".gpaDetail"));
  return (
    withGpa.find((s) =>
      /UNIVERSITY OF|OVERALL|CUMULATIVE|INSTITUTION/i.test(
        text(s.querySelector(".subreqTitle")),
      ),
    ) ?? withGpa[0]
  );
}

// "11/05/2026 01:32 PM" pieces -> "2026-11-05T13:32:00"
function toIsoLocal([, month, day, year, hour, minute, ampm]) {
  let h = Number(hour) % 12;
  if (ampm === "PM") h += 12;
  return `${year}-${month}-${day}T${String(h).padStart(2, "0")}:${minute}:00`;
}

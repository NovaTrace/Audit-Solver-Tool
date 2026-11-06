// bookmarklet/scrape/student.js — the audit's header numbers, read from
// the page's text (document.body.innerText). The patterns follow the
// audit's printed layout; check them against the live page.

/** Page text -> the `student` object (see the Audit JSON Data Guide). */
export function scrapeStudent(text) {
  // "Last, First" on one line, the degree ("BS in ...") on the next
  const who = text.match(/^\s*([^\n,]+,[^\n]+)\n\s*([A-Z]{2,4} in [^\n]+)/m);

  // Header table: Prepared On | Program Code | Catalog Year | Graduation Date
  const header = text.match(
    /Prepared On[^\n]*\n\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)\s+(\S+)\s+((?:Spring|Summer|Fall)\s+\d{4})/,
  );

  const programs = text.match(/Program:\s*([A-Z0-9, -]+)/);
  const required = text.match(/minimum of (\d+) applicable hours/i);
  const earned = text.match(/EARNED:\s*([\d.]+)\s*HOURS/);
  const inProgress = text.match(/IN PROGRESS\s+([\d.]+)\s+HOURS/);
  const gpa = text.match(
    /([\d.]+)\s+ATTEMPTED HOURS\s+[\d.]+\s+POINTS\s+([\d.]+)\s+GPA/,
  );

  return {
    name: who?.[1].trim() ?? "Unknown student",
    degreeTitle: who?.[2].trim() ?? "",
    programCode: header?.[7] ?? null,
    programs: programs
      ? programs[1]
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [],
    catalogYear: header?.[8] ?? null,
    preparedOn: header ? toIsoLocal(header) : null,
    graduationDate: null,
    allRequirementsMet: !/AT LEAST ONE REQUIREMENT HAS NOT BEEN SATISFIED/.test(
      text,
    ),
    hoursRequired: required ? Number(required[1]) : null,
    hoursEarned: earned ? Number(earned[1]) : null,
    hoursInProgress: inProgress ? Number(inProgress[1]) : null,
    gpa: gpa ? Number(gpa[2]) : null,
    attemptedHours: gpa ? Number(gpa[1]) : null,
  };
}

// "11/05/2026 01:32 PM" pieces -> "2026-11-05T13:32:00"
function toIsoLocal([, month, day, year, hour, minute, ampm]) {
  let h = Number(hour) % 12;
  if (ampm === "PM") h += 12;
  return `${year}-${month}-${day}T${String(h).padStart(2, "0")}:${minute}:00`;
}

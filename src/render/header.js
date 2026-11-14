// src/render/header.js — fills the page header from the audit's student info.
//
//   #student-name, #student-programs   name; majors and minors
//   #stat-catalog, #stat-audit         catalog year; audit date
//
// Used by: main.js.
// Text is set with textContent only.

/** Redraws the header. */
export function renderHeader(audit) {
  const { student } = audit;

  // "Majors: CPEN, ELEN · Minor: MATH".
  // Program codes look like "CPEN-BS", "ELEN-ADL" (added major), "MATH-MIN".
  // Codes with no dash ("CUSPG", "ENGRU") are the campus and college.
  const programs = (student.programs ?? []).filter((p) => p.includes("-"));
  const shortName = (program) => program.split("-")[0];
  const majors = programs.filter((p) => !p.endsWith("-MIN")).map(shortName);
  const minors = programs.filter((p) => p.endsWith("-MIN")).map(shortName);
  const list = (word, names) =>
    `${word}${names.length > 1 ? "s" : ""}: ${names.join(", ")}`;

  const details = [];
  if (majors.length) details.push(list("Major", majors));
  // No program codes (some PDFs): fall back to the degree title.
  else if (student.degreeTitle) details.push(student.degreeTitle);
  if (minors.length) details.push(list("Minor", minors));
  setText("student-name", student.name ?? "");
  setText("student-programs", details.join(" · "));

  setText("stat-catalog", student.catalogYear ?? "—");
  setText("stat-audit", formatDate(student.preparedOn));
}

// "Nov 5, 2026" from a Date or date string; "—" when empty.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

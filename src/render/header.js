// Fills in the page's header and footer from the audit's student info:
//   #student-name / #student-programs   name, then degree, programs, minors
//   #stat-catalog / #stat-audit          catalog year and audit date
//   #source-note    the footer line saying where the data came from
//
// Text is always set with textContent, so imported data can never be run
// as HTML.

/** Redraws the header and footer. `isSample` is true while the demo shows. */
export function renderHeader(audit, { isSample }) {
  const { student, source } = audit;

  // Name on its own line, then one line of details:
  // "BS in Computer Engineering · Programs: CPEN-BS + ELEN-ADL · Minor: MATH"
  const details = [];
  if (student.degreeTitle) details.push(student.degreeTitle);
  const programs = student.programs ?? [];
  const majors = programs.filter((p) => p.includes("-") && !p.endsWith("-MIN"));
  const minors = programs
    .filter((p) => p.endsWith("-MIN"))
    .map((p) => p.replace("-MIN", ""));
  if (majors.length > 1) details.push(`Programs: ${majors.join(" + ")}`);
  if (minors.length) {
    details.push(
      `${minors.length > 1 ? "Minors" : "Minor"}: ${minors.join(", ")}`,
    );
  }
  setText("student-name", student.name ?? "");
  setText("student-programs", details.join(" · "));

  // Catalog year and audit date
  setText("stat-catalog", student.catalogYear ?? "—");
  setText("stat-audit", formatDate(student.preparedOn));

  // Footer
  setText(
    "source-note",
    isSample
      ? "Showing sample data for a made-up student. Load your own audit above to plan your degree."
      : `Sources: your degree audit, prepared ${formatDate(student.preparedOn)}` +
          ` (imported from ${source.type}).`,
  );
}

// "Nov 5, 2026" from a Date or a date string; "—" when there's no date
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
